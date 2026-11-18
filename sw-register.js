if("serviceWorker" in navigator){window.addEventListener("load",()=>{navigator.serviceWorker.register("sw.js",{updateViaCache:"none"}).then(r=>{r.update();document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible")r.update()})}).catch(()=>{});let reloaded=false;const hadCtl=!!navigator.serviceWorker.controller;
  /* a new version took over: reload right away only if nothing typed would be lost, otherwise offer a button */
  navigator.serviceWorker.addEventListener("controllerchange",()=>{if(reloaded||!hadCtl)return;
    const pb=document.getElementById("pasteBox"),busy=(pb&&pb.value.trim())||(document.activeElement&&/TEXTAREA|INPUT|SELECT/.test(document.activeElement.tagName));
    if(!busy){reloaded=true;location.reload();return}
    if(document.getElementById("updBar"))return;const b=document.createElement("div");b.id="updBar";b.className="updbar";b.setAttribute("role","status");
    b.innerHTML='<span>A new version is ready.</span><button type="button" class="btn small">Reload</button>';b.querySelector("button").onclick=()=>{reloaded=true;location.reload()};document.body.appendChild(b)})})}
