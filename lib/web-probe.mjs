// Explicit one-shot diagnostics only. This does not power a polling loop.
export async function probeWeb(web,render,{now=()=>new Date().toISOString()}={}){
 const report={checkedAt:now(),fetch:{ok:false},search:{ok:false}};
 const code=e=>typeof e?.code==='string'?e.code:'PROBE_FAILED';
 try{
  report.fetch.provider=web.selectFetchProvider().id;
  report.fetch.ready=await web.fetchReady();
  if(report.fetch.ready){
   const r=await web.fetch({url:'https://example.com'},AbortSignal.timeout(12000));
   const text=render(r,2000);
   report.fetch={...report.fetch,status:r.statusCode,chars:text.length,ok:r.statusCode>=200&&r.statusCode<300&&text.includes('Example Domain'),truncated:Boolean(r.truncated),url:'https://example.com'};
  }
 }catch(e){report.fetch.code=code(e);}
 try{
  report.search.provider=web.selectSearchProvider().id;
  report.search.ready=await web.searchReady();
  if(report.search.ready){
   const r=await web.search({query:'IANA example domains official documentation',maxResults:3},AbortSignal.timeout(20000));
   report.search={...report.search,ok:Array.isArray(r.sources)&&r.sources.some(s=>/^https?:\/\//.test(s.url)),results:r.sources?.length||0};
  }
 }catch(e){report.search.code=code(e);}
 return report;
}
