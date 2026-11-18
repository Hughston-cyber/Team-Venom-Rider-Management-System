/* Team Venom Operations Hub */
(() => {
  const $ = selector => document.querySelector(selector);
  const staff = () => currentRoles.some(role => ["administrator", "manager"].includes(role));
  const activeMember = () => currentRoles.some(role => ["administrator", "manager", "member"].includes(role));
  let events = [], riders = [], countdownTimer = null;
  function msg(selector, text, error) { const n=$(selector); if(n){n.textContent=text;n.className=error?"inline-message error-state":"inline-message success-message";} }
  function node(tag, cls, text) { const n=document.createElement(tag); if(cls)n.className=cls; if(text!==undefined)n.textContent=text; return n; }
  function when(value) { return value ? new Date(value).toLocaleString("en-AU",{dateStyle:"medium",timeStyle:"short"}) : "Not recorded"; }
  function riderName(r) { return r ? (r.preferred_name ? r.preferred_name+" "+r.last_name : r.first_name+" "+r.last_name) : "Unknown rider"; }
  function eventStartDate(event) {
    if (!event?.start_date) return null;
    const date = String(event.start_date).slice(0, 10);
    const rawTime = String(event.start_time || "12:00").trim();
    let time;
    if (/^[0-9]{2}:[0-9]{2}$/.test(rawTime)) time = rawTime + ":00";
    else if (/^[0-9]{2}:[0-9]{2}:[0-9]{2}$/.test(rawTime)) time = rawTime;
    else return null;
    const parsed = new Date(date + "T" + time);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  async function log(action,module,record,details) {
    if(!currentUser?.id)return;
    const {error}=await supabaseClient.from("operations_activity").insert({actor_user_id:currentUser.id,action,module,record_id:record?String(record):null,details:details||{}});
    if(error)console.warn("Activity record failed:",error.message);
  }
  function fillEvents(selector,all) {
    const s=$(selector); if(!s)return; const old=s.value;
    s.replaceChildren(new Option(all?"All events":"Choose an event…",""));
    events.forEach(e=>s.add(new Option([e.event_name,e.season_year,e.venue].filter(Boolean).join(" · "),e.id)));
    if(events.some(e=>e.id===old))s.value=old;
  }
  function fillRiders() {
    const s=$("#ops-availability-rider"); if(!s)return; const old=s.value;
    s.replaceChildren(new Option("Choose a rider…",""));
    riders.forEach(r=>s.add(new Option(riderName(r),r.id)));
    if(riders.some(r=>r.id===old))s.value=old;
    if(currentRiderId){s.value=currentRiderId;s.disabled=!staff();}
  }
  async function references() {
    const [er,rr]=await Promise.all([
      supabaseClient.from("race_events").select("id,event_name,season_year,venue,start_date,end_date,start_time,status").order("start_date"),
      supabaseClient.from("riders").select("id,first_name,last_name,preferred_name,status").eq("status","active").order("first_name")
    ]);
    events=er.data||[]; riders=rr.data||[];
    ["#ops-contact-event","#ops-incident-event","#ops-availability-event","#ops-handover-event","#ops-countdown-event"].forEach(s=>fillEvents(s,false));
    fillEvents("#ops-availability-filter",true); fillRiders();
    const next=events.find(e=>{const start=eventStartDate(e);return start&&start>=new Date();})||events[0];
    if(next) ["#ops-countdown-event","#ops-availability-event","#ops-handover-event","#ops-incident-event"].forEach(s=>{if($(s)&&!$(s).value)$(s).value=next.id;});
    renderCountdown();
  }
  async function contacts() {
    const list=$("#ops-emergency-list"); list.replaceChildren();
    const {data,error}=await supabaseClient.from("team_emergency_contacts").select("id,contact_name,contact_role,phone,email,details,sort_order").order("sort_order").order("contact_name");
    if(error){list.append(node("p","empty-state","Emergency contacts could not be loaded."));return;}
    if(!data?.length){list.append(node("p","empty-state","No emergency contacts have been added yet."));return;}
    data.forEach(c=>{
      const card=node("article","ops-contact-card"),top=node("div","ops-item-top"),identity=node("div");
      identity.append(node("strong","",c.contact_name),node("small","",c.contact_role)); top.append(identity);
      if(staff()){const edit=node("button","text-button","Edit");edit.type="button";edit.addEventListener("click",()=>{
        const f=$("#ops-contact-form");["contact_name","contact_role","phone","email","details","sort_order"].forEach(k=>f.elements[k].value=c[k]??"");
        f.elements.contact_id.value=c.id;$("#ops-contact-save").textContent="Save changes";f.scrollIntoView({behavior:"smooth",block:"center"});
      });top.append(edit);}
      card.append(top);const actions=node("div","ops-contact-actions");
      if(c.phone){const a=node("a","text-button","☎ "+c.phone);a.href="tel:"+c.phone.replace(/[^\d+]/g,"");actions.append(a);}
      if(c.email){const a=node("a","text-button","Email contact");a.href="mailto:"+c.email;actions.append(a);}
      card.append(actions);if(c.details)card.append(node("p","ops-muted-copy",c.details));list.append(card);
    });
  }
  async function incidents() {
    const list=$("#ops-incident-list");list.replaceChildren();
    if(!staff()){list.append(node("p","empty-state","Incident records are visible to authorised management. You can submit a report above."));return;}
    const {data,error}=await supabaseClient.from("race_incidents").select("id,category,summary,occurred_at,location,description,action_taken,follow_up,status,created_at,race_events(event_name)").order("created_at",{ascending:false}).limit(100);
    if(error){list.append(node("p","empty-state","Incident records could not be loaded."));return;}
    if(!data?.length){list.append(node("p","empty-state","No incidents have been reported."));return;}
    data.forEach(i=>{
      const card=node("article","ops-record-card"),top=node("div","ops-item-top");
      top.append(node("strong","",i.summary),node("span","ops-status ops-status-"+i.status,i.status.replace("_"," ")));
      card.append(top,node("small","ops-meta",[i.category,i.race_events?.event_name,when(i.occurred_at)].filter(Boolean).join(" · ")),node("p","",i.description));
      if(i.location)card.append(node("small","ops-meta","Location: "+i.location));
      if(i.action_taken)card.append(node("p","ops-muted-copy","Action taken: "+i.action_taken));
      if(i.follow_up)card.append(node("p","ops-muted-copy","Follow-up: "+i.follow_up));
      const controls=node("div","ops-inline-controls"),select=document.createElement("select");
      [["open","Open"],["in_progress","In progress"],["closed","Closed"]].forEach(x=>select.add(new Option(x[1],x[0])));select.value=i.status;
      const save=node("button","text-button","Update status");save.type="button";save.addEventListener("click",async()=>{
        save.disabled=true;const {error:e}=await supabaseClient.from("race_incidents").update({status:select.value,updated_at:new Date().toISOString()}).eq("id",i.id);save.disabled=false;
        if(e){msg("#ops-incident-message","Incident status could not be updated.",true);return;}
        await log("Updated incident status","Incident Log",i.id,{status:select.value});msg("#ops-incident-message","Incident status updated.");await incidents();await activity();
      });controls.append(select,save);card.append(controls);list.append(card);
    });
  }
  async function availability() {
    const list=$("#ops-availability-list");list.replaceChildren();let q=supabaseClient.from("rider_availability").select("id,event_id,rider_id,availability_status,note,updated_at,riders(first_name,last_name,preferred_name),race_events(event_name)");
    if($("#ops-availability-filter").value)q=q.eq("event_id",$("#ops-availability-filter").value);
    const {data,error}=await q.order("updated_at",{ascending:false});
    if(error){list.append(node("p","empty-state","Availability could not be loaded."));return;}
    if(!data?.length){list.append(node("p","empty-state","No availability updates have been submitted."));return;}
    data.forEach(i=>{const card=node("article","ops-record-card"),top=node("div","ops-item-top");top.append(node("strong","",riderName(i.riders)),node("span","ops-status ops-status-"+i.availability_status,i.availability_status));card.append(top,node("small","ops-meta",(i.race_events?.event_name||"Race event")+" · Updated "+when(i.updated_at)));if(i.note)card.append(node("p","ops-muted-copy",i.note));list.append(card);});
  }
  async function handovers() {
    const list=$("#ops-handover-list");list.replaceChildren();
    const {data,error}=await supabaseClient.from("shift_handover_notes").select("id,shift_label,note,created_at,race_events(event_name)").order("created_at",{ascending:false}).limit(60);
    if(error){list.append(node("p","empty-state","Handover notes could not be loaded."));return;}
    if(!data?.length){list.append(node("p","empty-state","No handover notes have been added."));return;}
    data.forEach(i=>{const card=node("article","ops-record-card");card.append(node("strong","",i.shift_label),node("small","ops-meta",(i.race_events?.event_name||"Team update")+" · "+when(i.created_at)),node("p","",i.note));if(staff()){const del=node("button","text-button ops-danger-button","Delete note");del.type="button";del.addEventListener("click",async()=>{if(!confirm("Delete this handover note?"))return;const {error:e}=await supabaseClient.from("shift_handover_notes").delete().eq("id",i.id);if(e){msg("#ops-handover-message","The note could not be deleted.",true);return;}await log("Deleted handover note","Handover Notes",i.id);await handovers();await activity();});card.append(del);}list.append(card);});
  }
  function renderCountdown() {
    const event=events.find(e=>e.id===$("#ops-countdown-event")?.value),out=$("#ops-countdown-value"),label=$("#ops-countdown-label");if(!out||!label)return;
    if(!event?.start_date){out.textContent="—";label.textContent="Choose an event with a start date.";return;}
    const start=eventStartDate(event);
    if(!start){out.textContent="—";label.textContent="This event has an invalid start date or time. Ask an administrator to check the event details.";return;}
    const remaining=start.getTime()-Date.now();
    if(remaining<=0){out.textContent="00:00:00";label.textContent=event.event_name+" has started.";return;}
    const d=Math.floor(remaining/86400000),h=Math.floor(remaining%86400000/3600000),m=Math.floor(remaining%3600000/60000),s=Math.floor(remaining%60000/1000);
    out.textContent=(d?d+"d ":"")+[h,m,s].map(x=>String(x).padStart(2,"0")).join(":");
    label.textContent=event.event_name+" · "+start.toLocaleString("en-AU",{dateStyle:"medium",timeStyle:"short"});
  }
  async function systemStatus() {
    const grid=$("#ops-system-status");grid.replaceChildren();
    const checks=[
      ["Internet connection",Promise.resolve({ok:navigator.onLine,detail:navigator.onLine?"Browser reports online":"Browser is offline"})],
      ["Supabase database",supabaseClient.from("race_events").select("id",{head:true,count:"exact"}).then(r=>({ok:!r.error,detail:r.error?r.error.message:(r.count??0)+" event record(s) reachable"}))],
      ["Account session",supabaseClient.auth.getUser().then(r=>({ok:!r.error&&!!r.data.user,detail:r.error?"Session could not be verified":r.data.user?"Signed-in account verified":"No active session"}))],
      ["Service worker",("serviceWorker" in navigator)?navigator.serviceWorker.getRegistration().then(r=>({ok:!!r,detail:r?"App worker registered":"No service worker registration"})):Promise.resolve({ok:false,detail:"Not supported"})],
      ["Notification permission",Promise.resolve({ok:"Notification" in window&&Notification.permission==="granted",detail:"Notification" in window?"Permission: "+Notification.permission:"Not supported"})],
      ["Device push subscription",("serviceWorker" in navigator)?navigator.serviceWorker.ready.then(r=>r.pushManager.getSubscription()).then(s=>({ok:!!s,detail:s?"This device is subscribed":"This device is not subscribed"})):Promise.resolve({ok:false,detail:"Service worker unavailable"})]
    ];
    const results=await Promise.all(checks.map(async c=>({name:c[0],...(await c[1].catch(e=>({ok:false,detail:e.message||"Check failed"})))})));
    results.forEach(r=>{const card=node("article","ops-health-card"),top=node("div","ops-item-top");top.append(node("strong","",r.name),node("span","ops-health-dot "+(r.ok?"is-ok":"is-warning"),r.ok?"OK":"CHECK"));card.append(top,node("small","ops-meta",r.detail));grid.append(card);});
    $("#ops-system-updated").textContent="Checked "+new Date().toLocaleTimeString("en-AU");
  }
  async function activity() {
    const list=$("#ops-activity-list");list.replaceChildren();
    if(!staff()){list.append(node("p","empty-state","Activity history is available to authorised management."));return;}
    const [a,b]=await Promise.all([
      supabaseClient.from("operations_activity").select("id,actor_user_id,action,module,record_id,details,occurred_at").order("occurred_at",{ascending:false}).limit(50),
      supabaseClient.from("audit_log").select("id,actor_user_id,action,table_name,record_id,occurred_at,details").order("occurred_at",{ascending:false}).limit(50)
    ]);
    const ids=[...(a.data||[]).map(x=>x.actor_user_id),...(b.data||[]).map(x=>x.actor_user_id)].filter(Boolean);
    const profiles=ids.length?await supabaseClient.from("member_profiles").select("user_id,display_name").in("user_id",[...new Set(ids)]):{data:[]};
    const names=new Map((profiles.data||[]).map(x=>[x.user_id,x.display_name]));
    const rows=[...(a.data||[]).map(x=>({...x,source:"Operations"})),...(b.data||[]).map(x=>({...x,module:x.table_name,source:"Database audit"}))].sort((x,y)=>new Date(y.occurred_at)-new Date(x.occurred_at)).slice(0,60);
    if(!rows.length){list.append(node("p","empty-state","No activity has been recorded yet."));return;}
    rows.forEach(x=>{const row=node("article","ops-activity-row");row.append(node("strong","",x.action),node("small","ops-meta",(names.get(x.actor_user_id)||"Team member")+" · "+(x.module||"System")+" · "+when(x.occurred_at)+" · "+x.source));list.append(row);});
  }
  async function loadOperationsHub() {
    if(!activeMember())return;
    $("#ops-contact-form").hidden=!staff();$("#ops-activity-panel").hidden=!staff();$("#ops-incident-list-panel").hidden=!staff();
    await references();await Promise.all([contacts(),incidents(),availability(),handovers(),systemStatus(),activity()]);
  }
  window.loadOperationsHub=loadOperationsHub;

  $("#ops-contact-form")?.addEventListener("submit",async e=>{
    e.preventDefault();if(!staff())return;const f=e.currentTarget,v=Object.fromEntries(new FormData(f).entries()),id=v.contact_id;
    const data={contact_name:v.contact_name.trim(),contact_role:v.contact_role.trim(),phone:v.phone.trim()||null,email:v.email.trim()||null,details:v.details.trim()||null,sort_order:Number(v.sort_order)||0,updated_at:new Date().toISOString()};
    const result=id?await supabaseClient.from("team_emergency_contacts").update(data).eq("id",id):await supabaseClient.from("team_emergency_contacts").insert({...data,created_by:currentUser.id});
    if(result.error){msg("#ops-contact-message","Contact could not be saved. Check your access and try again.",true);return;}
    await log(id?"Updated emergency contact":"Added emergency contact","Emergency Contacts",id||v.contact_name);
    f.reset();f.elements.contact_id.value="";$("#ops-contact-save").textContent="Add contact";msg("#ops-contact-message","Emergency contact saved.");await contacts();await activity();
  });
  $("#ops-contact-cancel")?.addEventListener("click",()=>{$("#ops-contact-form").reset();$("#ops-contact-form").elements.contact_id.value="";$("#ops-contact-save").textContent="Add contact";msg("#ops-contact-message","");});
  $("#ops-incident-form")?.addEventListener("submit",async e=>{
    e.preventDefault();const f=e.currentTarget,v=Object.fromEntries(new FormData(f).entries());
    const data={event_id:v.event_id||null,category:v.category,summary:v.summary.trim(),occurred_at:v.occurred_at?new Date(v.occurred_at).toISOString():new Date().toISOString(),location:v.location.trim()||null,description:v.description.trim(),action_taken:v.action_taken.trim()||null,follow_up:v.follow_up.trim()||null,reported_by:currentUser.id};
    const {error}=await supabaseClient.from("race_incidents").insert(data);
    if(error){msg("#ops-incident-message","Incident report could not be submitted. Please try again.",true);return;}
    await log("Submitted incident report","Incident Log",data.summary,{category:data.category});f.reset();msg("#ops-incident-message","Incident report submitted securely.");await incidents();await activity();
  });
  $("#ops-availability-form")?.addEventListener("submit",async e=>{
    e.preventDefault();const f=e.currentTarget,v=Object.fromEntries(new FormData(f).entries()),rider=staff()?v.rider_id:currentRiderId;
    if(!rider||!v.event_id){msg("#ops-availability-message","Choose an event and rider.",true);return;}
    const data={event_id:v.event_id,rider_id:rider,availability_status:v.availability_status,note:v.note.trim()||null,updated_by:currentUser.id,updated_at:new Date().toISOString()};
    const {error}=await supabaseClient.from("rider_availability").upsert(data,{onConflict:"event_id,rider_id"});
    if(error){msg("#ops-availability-message","Availability could not be saved. Check your access and try again.",true);return;}
    await log("Updated rider availability","Rider Availability",rider,{event_id:v.event_id,status:v.availability_status});f.elements.note.value="";msg("#ops-availability-message","Rider availability saved.");await availability();await activity();
  });
  $("#ops-availability-filter")?.addEventListener("change",availability);
  $("#ops-handover-form")?.addEventListener("submit",async e=>{
    e.preventDefault();const f=e.currentTarget,v=Object.fromEntries(new FormData(f).entries()),data={event_id:v.event_id||null,shift_label:v.shift_label.trim(),note:v.note.trim(),created_by:currentUser.id};
    const {data:created,error}=await supabaseClient.from("shift_handover_notes").insert(data).select("id").single();
    if(error){msg("#ops-handover-message","Handover note could not be saved. Please try again.",true);return;}
    await log("Added handover note","Handover Notes",created?.id,{shift:data.shift_label});f.reset();msg("#ops-handover-message","Handover note shared with the team.");await handovers();await activity();
  });
  $("#ops-countdown-event")?.addEventListener("change",renderCountdown);
  $("#ops-refresh-status")?.addEventListener("click",systemStatus);
  $("#ops-refresh-all")?.addEventListener("click",loadOperationsHub);
  if(!countdownTimer)countdownTimer=window.setInterval(renderCountdown,1000);
})();
