import re,subprocess
s=open('index.html',encoding='utf-8').read()
for i,b in enumerate(re.findall(r'<script(?![^>]*src)[^>]*>(.*?)</script>',s,re.S)):
    open(f'/tmp/b{i}.js','w').write(b); print(i,subprocess.run(['node','--check',f'/tmp/b{i}.js'],capture_output=True,text=True).returncode)
