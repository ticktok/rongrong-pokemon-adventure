// Shared by synthetic browser checks and the backed-up QA family.
import {expect} from '@playwright/test';
import assert from 'node:assert/strict';

export function populateForest(state,makePartner,rt){
  state.settings.weekdayPassDate=state.daily.date;
  state.settings.captureLimit=12;
  state.badges=['home-meadow','blue-river','sunny-harbor','leaf-garden'];
  state.gymProgress.firstWins['leaf-garden']='2026-10-10';
  state.position={regionId:'mist-forest',x:24,y:14};
  for(const species of [102,102,1,2,3,4,5,6,7,8,9,10,11])state.partners.push(makePartner(species,24,rt));
}
export async function checkForest(page,current,simulateSlowSave=false){
  await page.bringToFront();
  await page.locator('canvas[aria-label="浅红秘林地图就绪"]').waitFor();
  await page.getByRole('button',{name:'区域小地图'}).click();
  const cursor=page.locator('.local-map circle').last();
  const walk=async(key,attribute,target)=>{
    await page.keyboard.down(key);
    try{
      await page.waitForFunction(([attribute,target])=>document.querySelector('.local-map circle:last-of-type')?.getAttribute(attribute)===target,[attribute,target],{polling:'raf',timeout:6000});
    }finally{await page.keyboard.up(key);}
  };
  await expect(cursor).toHaveAttribute('cx','24.5');
  await walk('ArrowRight','cx','28.5');
  await walk('ArrowUp','cy','13.5');
  const gym=page.getByRole('dialog',{name:'道馆挑战确认'});
  for(const x of [28,29,30]){
    if(x===30&&simulateSlowSave)await page.evaluate(()=>{window.__controls.flags.delayResponse=1800;});
    if(x>28)await walk('ArrowRight','cx',String(x+.5));
    if(x===30&&simulateSlowSave){
      await page.waitForFunction(()=>JSON.parse(localStorage.getItem('rr-pending-child')||'null')?.type==='world.position');
    }
    if(x===29){
      const button=page.getByRole('button',{name:'进入道馆',exact:true});
      if(await page.evaluate(()=>navigator.maxTouchPoints>0))await button.tap();else await button.click();
    }else await page.keyboard.press(x===28?'e':'Space');
    await expect(gym).toContainText('阿桔');
    assert.equal((await current()).state.daily.gymStarts??0,0);
    await gym.getByRole('button',{name:'再准备一下'}).click();
  }
}
export async function checkLockCards(page,current){
  await page.bringToFront();
  const search=page.getByRole('searchbox',{name:'搜索上场伙伴'});
  const cards=page.locator('.partner-lock-row');
  await expect(cards).toHaveCount(12);
  await page.getByRole('button',{name:'下一页',exact:true}).click();await expect(cards).toHaveCount(2);
  for(const term of ['蛋蛋','dandan','Exeggcute','#102']){
    await search.fill(term);await expect(cards).toHaveCount(2);
  }
  const before=(await current()).state;
  const twins=before.boxes.flatMap(b=>b.slots).filter(id=>before.partners.find(p=>p.id===id)?.speciesId===102);
  await cards.nth(1).getByRole('button',{name:'锁定',exact:true}).click();
  await expect(cards.nth(1).getByRole('button',{name:'解锁',exact:true})).toBeVisible();
  const after=(await current()).state;
  assert(!after.partners.find(p=>p.id===twins[0]).parentLocked);
  assert(after.partners.find(p=>p.id===twins[1]).parentLocked);
  await page.getByLabel('上场状态').selectOption('locked');await expect(cards).toHaveCount(1);
  await search.fill('不存在的宝可梦');await page.getByRole('button',{name:'清除筛选'}).click();
  await expect(cards).toHaveCount(12);
  await page.getByRole('searchbox',{name:'搜索替补'}).fill('Exeggcute');
  await expect(page.getByLabel('选择替补').locator('option')).toHaveCount(2);
}
export async function checkBoxEvolution(page,current,loseResponse=false){
  await page.bringToFront();
  await page.locator('.box-grid').getByRole('button',{name:'查看蛋蛋',exact:true}).first().click();
  if(loseResponse)await page.evaluate(()=>{window.__controls.flags.loseResponse=true;});
  page.once('dialog',d=>d.accept());
  await page.getByRole('button',{name:'进化为椰蛋树'}).click();
  const scene=page.getByRole('dialog',{name:'宝可梦进化'});
  await expect(scene).toBeVisible();
  if(loseResponse){
    await expect(scene).toContainText('响应丢失');
    assert.equal(await scene.getByRole('button',{name:'继续',exact:true}).count(),0);
    const before=(await current()).revision;
    await scene.getByRole('button',{name:'重试'}).click();
    await expect(scene).toContainText('恭喜！蛋蛋进化成椰蛋树了！',{timeout:12000});
    assert.equal((await current()).revision,before);
  }
  await scene.getByRole('button',{name:'继续',exact:true}).click();
  await expect(page.locator('.partner-detail h2')).toHaveText('椰蛋树');
  await expect(page.locator('.box-grid').getByRole('button',{name:'查看椰蛋树',exact:true})).toHaveCount(1);
}
