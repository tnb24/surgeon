import { chromium, expect } from '@playwright/test';
import fs from 'node:fs';

const browser = await chromium.launch();
const page = await browser.newPage({viewport:{width:1500,height:1100}});
const errors=[];
page.on('pageerror', e=>{errors.push(e.message); console.error('PAGE ERROR: '+e.message);});
await page.goto('http://127.0.0.1:8791');
await expect(page.getByRole('button',{name:'Analyze text',exact:true})).toBeEnabled({timeout:120000});
if (process.argv.includes('--inspect')) {
  await page.screenshot({path:'exploration/app-running.png',fullPage:true});
  console.log(JSON.stringify({title:await page.title(),status:await page.locator('.status').innerText(),errors}));
} else {
  const cases=JSON.parse(fs.readFileSync('exploration/finalists.json','utf8'));
  const verified=[];
  for (const c of cases) {
    await page.getByRole('button',{name:'Reset',exact:true}).click();
    await page.getByLabel('Prompt',{exact:true}).fill(c.prompt);
    await page.getByRole('button',{name:'Analyze text',exact:true}).click();
    await expect(page.getByRole('button',{name:'Analyze text',exact:true})).toBeEnabled({timeout:120000});
    for (const e of c.edits) {
      await page.locator('.layers button').nth(e.layer).click();
      await page.getByLabel('Neuron ID',{exact:true}).fill(String(e.neuron));
      await page.locator('.modes').getByRole('button',{name:e.mode,exact:true}).click();
      if(e.mode!=='ablate') await page.getByLabel('Intervention value',{exact:true}).fill(String(e.value));
      await page.getByRole('button',{name:'Apply to experiment',exact:true}).click();
    }
    await page.getByLabel('New tokens',{exact:true}).fill(String(c.max_new));
    await page.getByRole('button',{name:'Run comparison',exact:true}).click();
    await expect(page.getByRole('button',{name:'Run comparison',exact:true})).toBeVisible({timeout:180000});
    await expect(page.getByRole('heading',{name:'Next token at the shared prompt'})).toBeVisible();
    const text=await page.locator('.completion').allTextContents();
    if(text[0]!==c.prompt+c.baseline || text[1]!==c.prompt+c.modified) throw Error('Reproduction mismatch: '+c.name);
    await page.screenshot({path:`exploration/${c.name}.png`,fullPage:true});
    const downloadPromise=page.waitForEvent('download');
    await page.getByRole('button',{name:'Save experiment',exact:true}).click();
    await (await downloadPromise).saveAs(`exploration/${c.name}.json`);
    verified.push({name:c.name,text});
    console.log('Browser reproduced: '+c.name);
  }
  fs.writeFileSync('exploration/browser-verified.json',JSON.stringify({verified,errors},null,2));
}
await browser.close();
if(errors.length) throw Error(errors.join('\n'));
