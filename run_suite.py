import sys, subprocess, re, tempfile, os
sys.stdout.reconfigure(encoding='utf-8')

edge_path = r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
url = os.environ.get('SONGLAM_TEST_URL', 'http://127.0.0.1:8080/test_runner.html')
# A fresh browser profile isolates test fixtures from the user's hotel data.
profile = tempfile.mkdtemp(prefix='songlam-regression-')
res = subprocess.run([edge_path, '--headless', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--user-data-dir=' + profile, '--virtual-time-budget=15000', '--dump-dom', url], capture_output=True, text=True, encoding='utf-8', timeout=60)
dom = res.stdout
if res.returncode != 0 or not dom:
    print('Browser did not execute tests. Exit:', res.returncode)
    print(res.stderr[-2500:])
    sys.exit(1)

if re.search(r'<tr class="fail">[\s\S]*?<span class="code">TC-FATAL</span>', dom):
    idx = dom.find('TC-FATAL')
    print("FATAL ERROR:")
    print(dom[idx-50:idx+600])

rows = re.findall(r'<tr class="(pass|fail)">\s*<td.*?>(.*?)</td>\s*<td><span class="code">(.*?)</span></td>\s*<td.*?>(.*?)</td>.*?<span class="badge badge-(?:pass|fail)">\s*(PASS|FAIL)\s*</span>', dom, re.DOTALL)
print(f'Total test cases executed: {len(rows)}')
passed = 0
for r in rows:
    status = r[4]
    if status == 'PASS':
        passed += 1
    print(f"[{status}] {r[2]} - {r[3].strip()}")

print(f"\nRESULT: {passed}/{len(rows)} PASSED")
sys.exit(0 if len(rows) == 18 and passed == 18 else 1)
