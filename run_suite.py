import sys, subprocess, re
sys.stdout.reconfigure(encoding='utf-8')

edge_path = r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
url = 'http://localhost:8080/test_runner.html'
res = subprocess.run([edge_path, '--headless', '--disable-gpu', '--virtual-time-budget=10000', '--dump-dom', url], capture_output=True, text=True, encoding='utf-8')
dom = res.stdout

if 'TC-FATAL' in dom:
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
