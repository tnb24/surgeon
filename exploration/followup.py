import json
from explore import api, generate, edit, ROOT

city = 'The city was quiet after the rain. In the distance,'
arithmetic = '1 + 1 = 2\n2 + 2 = 4\n3 + 3 ='
analyses=[]
for name,prompt,layer,n in [('city',city,6,2130),('arithmetic',arithmetic,11,2378),('arithmetic-format',arithmetic,6,2081)]:
    a=api('/analyze',{'prompt':prompt})
    d={**api(f'/analysis/{a["id"]}/layers/{layer}'),**api(f'/analysis/{a["id"]}/layers/{layer}/neurons/{n}')}
    analyses.append(dict(name=name,prompt=prompt,layer=layer,neuron=n,tokens=a['tokens'],trace=d['trace'],peak=d['values'][n],peak_token=a['tokens'][d['positions'][n]]))
(ROOT/'activation-evidence.json').write_text(json.dumps(analyses,indent=2),encoding='utf8')

for dose in (7,8,9):
    generate(f'city-dose-{dose}',city,[edit(6,2130,'add',dose)],32)
french='Le soleil brille dans le ciel. Les oiseaux chantent et'
for dose in (5,10):
    generate(f'french-dose-{dose}',french,[edit(6,795,'add',dose)],32)
generate('english-weather-L6-N795','The sun is shining in the sky. The birds are singing and',[edit(6,795,'add',20)],32)
