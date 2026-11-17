"""Carga el experimento V3 sin confundir los dos módulos experimento.py."""
import importlib.util
from pathlib import Path
spec=importlib.util.spec_from_file_location('race_fc_v3',Path(__file__).resolve().parent.parent/'modelo_fc_v3'/'experimento.py')
module=importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
enrich=module.enrich
metrics=module.metrics
paired=module.paired
