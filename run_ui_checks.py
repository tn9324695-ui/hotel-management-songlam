"""Run localhost UI checks and capture previews in isolated Edge profiles."""
from pathlib import Path
import argparse, html, json, re, subprocess, sys, tempfile

sys.stdout.reconfigure(encoding='utf-8')
parser=argparse.ArgumentParser()
parser.add_argument('--screenshots',action='store_true')
args=parser.parse_args()
edge=r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
profile=tempfile.mkdtemp(prefix='songlam-ui-')
base=[edge,'--headless','--disable-gpu','--no-first-run','--no-default-browser-check','--force-device-scale-factor=1','--user-data-dir='+profile]
url='http://127.0.0.1:8080/'
if args.screenshots:
    targets=[('overview',1366,768),('overview',1920,1080),('timeline',1366,768),('room_rack',1366,768),('bookings',1366,768),('billing',1366,768),('reports',1366,768),('overview',390,844)]
    for screen,width,height in targets:
        path=Path('screenshots')/f'redesign_{screen}_{width}.png'
        preview=f'tests/preview.html?width={width}&height={height}&screen={screen}'
        result=subprocess.run(base+['--hide-scrollbars',f'--window-size={width},{height}','--virtual-time-budget=1500','--screenshot='+str(path.resolve()),url+preview],capture_output=True,text=True,encoding='utf-8',timeout=30)
        if result.returncode or not path.exists():
            print(result.stderr[-1500:]);sys.exit(1)
        print(path)
else:
    result=subprocess.run(base+['--virtual-time-budget=20000','--dump-dom',url+'tests/ui.html'],capture_output=True,text=True,encoding='utf-8',timeout=60)
    match=re.search(r'<div id="results"[^>]*data-complete="true"[^>]*>(.*?)</div>',result.stdout,re.S)
    if result.returncode or not match:
        print('UI checks did not complete.');print(result.stderr[-1500:]);print(result.stdout[:1000]);sys.exit(1)
    report=json.loads(html.unescape(match.group(1)))
    print(json.dumps(report,ensure_ascii=False,indent=2))
    Path('screenshots/ui-checks.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    sys.exit(0 if report['total']>0 and report['passed']==report['total'] else 1)
