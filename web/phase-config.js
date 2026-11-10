/* Display-only Act override. Raw Buckler phase='unknown' remains untouched.
   When the user reports a new Act, add an effective timestamp for that change
   and preserve the previous Act label for historical observations. */
(function(root,factory){
  const config=factory();
  if(typeof module==='object'&&module.exports)module.exports=config;
  root.SF6PhaseConfig=config;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const ACTS=[
    // User-provided provisional assumption; not verified by Buckler.
    {act:14,effectiveFrom:null,source:'user_provisional'}
    // Future Act: append {act:15,effectiveFrom:'YYYY-MM-DDTHH:mm:ss+09:00',source:'user_provisional'}.
  ];
  function assignedAct(time){
    const stamp=Date.parse(time||'');
    let active=ACTS[0];
    for(const entry of ACTS.slice(1)){
      if(Number.isFinite(stamp)&&Number.isFinite(Date.parse(entry.effectiveFrom))&&
          stamp>=Date.parse(entry.effectiveFrom))active=entry;
    }
    return active;
  }
  function label(phase,time){
    if(phase&&phase!=='unknown')return String(phase);
    return `Act ${assignedAct(time).act}（暫定）`;
  }
  return {currentAct:ACTS.at(-1).act,acts:ACTS,label,assignedAct};
});
