(function(){const b=document.getElementById("ctlBar"),h=document.querySelector("header.top"),c=document.getElementById("chkBar");if(!b||!h)return;
const yp=document.getElementById("yearPrev");
const setH=()=>{const r=document.documentElement.style;r.setProperty("--ctl-h",Math.round(b.getBoundingClientRect().height)+"px");const w=yp&&yp.getBoundingClientRect().width;if(w)r.setProperty("--yr-btn-w",w+"px")};setH();
if(window.ResizeObserver){const ro=new ResizeObserver(setH);ro.observe(b);if(yp)ro.observe(yp)}
const upd=()=>{const t=parseFloat(getComputedStyle(b).top)||0;b.classList.toggle("stuck",(window.scrollY||0)>0&&b.getBoundingClientRect().top<=t+0.5);
};
window.addEventListener("scroll",upd,{passive:true});window.addEventListener("resize",upd);upd()})();
