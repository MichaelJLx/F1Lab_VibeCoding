"""Build a Spa reference within the road boundaries, penalising lateral acceleration peaks."""
import json
from pathlib import Path
import numpy as np
from scipy.optimize import minimize
from scipy.sparse import coo_matrix

root = Path(__file__).resolve().parents[2] / 'src/tracks'
read = lambda name: json.loads((root / name).read_text())
track = read('spa.json')
nodes = track['nodes']
center = np.array([[n['x'], n['y']] for n in nodes])
tangent = np.roll(center, -1, axis=0) - np.roll(center, 1, axis=0)
normal = tangent[:, [1, 0]] * [-1, 1] / np.linalg.norm(tangent, axis=1)[:, None]
samples = read('spa-flying-speed.json')['points']
speed = np.interp([n['s'] for n in nodes], [p['s'] for p in samples],
                  [p['speed'] for p in samples], period=track['geometryLength'])
reference = np.array(read('spa-race-path.json')['offsets'])
indices = np.arange(len(nodes))
# A wheel may reach the low inner lip; all four tyres must not leave the road.
kerbs = read('spa-kerb-zones.json')
def bounds_at(n):
    station = n['s']*7004/track['geometryLength']
    side = next((side for (a,b),side in kerbs if a <= station < b), 0)
    return (-n['widthRight'] + (.65 if side < 0 else 1.5),
             n['widthLeft'] - (.65 if side > 0 else 1.5))
bounds = [bounds_at(n) for n in nodes]

def curvature(a, b, c):
    u, v = b-a, c-b
    return 2*(u[:, 0]*v[:, 1]-u[:, 1]*v[:, 0]) / (
        np.linalg.norm(u, axis=1)*np.linalg.norm(v, axis=1)*np.linalg.norm(c-a, axis=1))

# Successively linearise curvature about the current line; all offsets are metres.
offset = reference.copy()
for iteration in range(3):
    points = center + normal*offset[:, None]
    a, c = np.roll(points, 1, axis=0), np.roll(points, -1, axis=0)
    k = curvature(a, points, c)
    eps = .002
    columns = [(indices-1)%len(nodes), indices, (indices+1)%len(nodes)]
    derivatives = [(curvature(a+eps*normal[columns[0]], points, c)-k)/eps,
                   (curvature(a, points+eps*normal, c)-k)/eps,
                   (curvature(a, points, c+eps*normal[columns[2]])-k)/eps]
    jac = coo_matrix((np.concatenate(derivatives), (np.tile(indices, 3),
                     np.concatenate(columns))), shape=(len(nodes),len(nodes))).tocsr()
    # Weight higher-speed bends using measured speed as a demand probe, not a target speed.
    scale = (speed/55)**2 * 100
    def objective(x):
        demand = (k + jac @ (x-offset))*scale
        excess = np.maximum(0, np.abs(demand)-.7)
        cost = (demand**2 + 8*excess**2 + .0008*(x-reference)**2).sum()
        grad = jac.T @ ((2*demand+16*np.sign(demand)*excess)*scale) + .0016*(x-reference)
        return cost, grad
    offset = minimize(objective, offset, jac=True, method='L-BFGS-B', bounds=bounds,
                      options={'maxiter':1800,'ftol':1e-11}).x
(root/'spa-fast-line.json').write_text(json.dumps(np.round(offset,5).tolist(),separators=(',',':')))
