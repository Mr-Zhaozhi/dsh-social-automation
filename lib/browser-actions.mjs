export async function verifiedClick(locator,readState){
  if(await readState())return false;
  await locator.click({timeout:5000});
  const deadline=Date.now()+6000;
  while(Date.now()<deadline){if(await readState())return true;await new Promise(r=>setTimeout(r,250));}
  throw new Error('点击后未验证到目标状态；结果待确认，请勿立即重试');
}
export function validCount(value,max){const n=Number(value??1);if(!Number.isInteger(n)||n<1||n>max)throw new Error(`次数须为 1–${max} 的整数`);return n;}
