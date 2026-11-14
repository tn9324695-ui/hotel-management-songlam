"""Open the localhost frontend in a fresh Edge profile; never read user profiles."""
import argparse
import os
from pathlib import Path
import subprocess
import tempfile
import urllib.request

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--port', type=int, default=8080)
parser.add_argument('--page', choices=['index.html','login.html','reception-api.html','housekeeping-api.html','services-api.html','finance-api.html','admin-api.html'], default='index.html')
args = parser.parse_args()
if not 1 <= args.port <= 65535:
    parser.error('Port must be between 1 and 65535.')
edge = Path(os.environ.get('ProgramFiles(x86)', r'C:\Program Files (x86)')) / 'Microsoft/Edge/Application/msedge.exe'
if not edge.is_file():
    parser.exit(1, 'Microsoft Edge was not found.\n')
url = f'http://127.0.0.1:{args.port}/{args.page}'
try:
    with urllib.request.urlopen(url, timeout=5) as response:
        if response.status != 200:
            raise ValueError()
except Exception:
    parser.exit(1, 'Start the frontend localhost server first.\n')
profile = tempfile.mkdtemp(prefix='songlam-preview-')
# Intentional visible interactive browser for the requested frontend trial.
# Argument list, shell=False; no copying, exporting or deleting existing data.
subprocess.Popen([str(edge), '--user-data-dir=' + profile, '--no-first-run',
                  '--no-default-browser-check', '--new-window', url],
                 stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
print('Frontend preview: ' + url)
print('Isolated preview profile; this launcher does not connect SQL. Reuse this window to retain trial changes.')
