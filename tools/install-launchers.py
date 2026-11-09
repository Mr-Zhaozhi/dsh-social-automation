from pathlib import Path
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'lib'))
from launchers import install
print(install(Path(__file__).resolve().parents[1]))
