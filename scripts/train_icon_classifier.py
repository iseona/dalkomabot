"""Reproducible ridge training; fixture holdouts are never read here.
Run export_icon_training.mjs first. Requires numpy only, no paid service.
"""
import json
from pathlib import Path
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
data = json.loads((ROOT / '.local-icon-training' / 'features.json').read_text(encoding='utf-8'))
x = np.asarray(data['features'], dtype=np.float64)
names = data['names']
y = np.eye(len(names))[np.asarray(data['labels'])]
regularizer = np.eye(x.shape[1]) * 12
regularizer[-1, -1] = .01
w = np.linalg.solve(x.T @ x + regularizer, x.T @ y).T
output = ROOT / 'dist' / 'models'
output.mkdir(exist_ok=True)
(output / 'icon-ridge-v1.bin').write_bytes(w.astype('<f4').tobytes())
meta = dict(version=1, architecture='ridge-rgb16-hist16', featureSize=x.shape[1],
            names=names, seed=190914, regularization=12, trainingExamples=len(x),
            trainingSources=data['sources'], autoConfirm=False,
            scoreMeaning='Uncalibrated ranking, not probability',
            validationSources=['lead-validation-01.png', 'lead-validation-02.png',
                               'lead-validation-03.png', 'lead-validation-04.png'])
(output / 'icon-ridge-v1.json').write_text(json.dumps(meta, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
print(json.dumps(dict(classes=len(names), examples=len(x), bytes=w.size*4)))
