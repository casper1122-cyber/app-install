/* KYNIZM 開啟畫面（陶燈油畫）— 安裝頁 go.html 用。由 brand-20261111/loading-oil/build_site.py 產生 app-install/lamp/lamp.js，不要直接改產物。
   做法照定案：油畫幀在電腦預先算好（底圖筆觸重畫 6 張、火 12 張），手機只換張與位移縮放，不用即時 SVG 濾鏡（iPhone WebKit 會掉到每秒 3 格）。
   用法：var L = KLamp.mount(host); L.status("載入資料…"); L.enter(function () { 顯示 App });
   App 自己的載入閘門用 KLamp.mount(gate, { embed: true })：只佔 host 範圍、不顯示狀態字與「直接開啟」（閘門有自己的字）。
   轉場照「資料好了（有密碼則解鎖後）馬上轉場」：開啟到現在 1.2 秒內＝只天亮約 0.9 秒；比較久＝火熄成火心→重燃→天亮約 2 秒。 */
(function () {
  var P = (document.currentScript && document.currentScript.src || "").replace(/[^\/]*$/, "");
  var NS = "http://www.w3.org/2000/svg";
  var RM = !!(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches);
  var IMG_B = [], IMG_F = [];
  for (var i = 0; i < 6; i++) IMG_B.push(P + "base_" + i + ".jpg");
  for (var j = 0; j < 12; j++) IMG_F.push(P + "flame_" + j + ".png");
  var IMG_SMOKE = P + "smoke.png", IMG_DUST = P + "dust.png";
  /* 不規則雜訊：雜湊值插值（不是正弦疊加，不會週期重複） */
function hsh(i,s){var x=Math.sin(i*127.1+s*311.7)*43758.5453;return(x-Math.floor(x))*2-1}
function vn(x,s){var i=Math.floor(x),f=x-i,u=f*f*(3-2*f);return hsh(i,s)*(1-u)+hsh(i+1,s)*u}
function fbm(x,s){return vn(x,s)+.5*vn(x*2.03,s+7)+.25*vn(x*4.11,s+13)}
var STEP=1/12;   /* 定格：一秒 12 張，每張停住，像一張一張畫出來的 */
/* 油畫的「顏料在動」事先在電腦上畫好（底圖 6 張、火 12 張），手機只負責換張，不跑濾鏡（iPhone 跑 SVG 濾鏡會卡到每秒 3 格） */
function loadImg(src){var i=new Image();i.src=src;return i}
var SMOKE_IMG=loadImg(IMG_SMOKE),DUST_IMG=loadImg(IMG_DUST);
function Scene(host,seed,manual){
  var self=this;host.innerHTML="";
  var svg=document.createElementNS(NS,"svg");svg.setAttribute("viewBox","79 0 706 1536");svg.setAttribute("preserveAspectRatio","xMidYMid slice");svg.setAttribute("aria-hidden","true");
  var id="s"+seed,bi="",fi="";
  for(var i=0;i<IMG_B.length;i++)bi+='<image class="bv" href="'+IMG_B[i]+'" x="79" y="0" width="706" height="1536" preserveAspectRatio="none"'+(i?' visibility="hidden"':'')+'/>';
  for(var i=0;i<IMG_F.length;i++)fi+='<image class="fv" href="'+IMG_F[i]+'" x="650" y="340" width="100" height="200"'+(i?' visibility="hidden"':'')+'/>';
  svg.innerHTML='<defs>'+
   '<radialGradient id="'+id+'l"><stop offset="0" stop-color="#FFB45A" stop-opacity=".30"/><stop offset=".5" stop-color="#E07A2A" stop-opacity=".09"/><stop offset="1" stop-color="#E07A2A" stop-opacity="0"/></radialGradient>'+
   '<radialGradient id="'+id+'g"><stop offset="0" stop-color="#FFD9A0" stop-opacity=".55"/><stop offset="1" stop-color="#FF9A40" stop-opacity="0"/></radialGradient>'+
   '<radialGradient id="'+id+'e"><stop offset="0" stop-color="#FFC27A"/><stop offset=".45" stop-color="#E0561C" stop-opacity=".6"/><stop offset="1" stop-color="#E0561C" stop-opacity="0"/></radialGradient>'+
   '<radialGradient id="'+id+'sh"><stop offset="0" stop-color="#000" stop-opacity=".45"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>'+
  '</defs>'+bi+
  '<ellipse class="sh" cx="300" cy="712" rx="250" ry="34" fill="url(#'+id+'sh)"/>'+
  '<rect class="dk" x="79" width="706" height="1536" fill="#080402" opacity="0"/>'+
  '<circle class="lt" cx="696" cy="450" r="520" fill="url(#'+id+'l)"/>'+
  '<g class="fg"><ellipse class="gl" cx="696" cy="470" rx="48" ry="88" fill="url(#'+id+'g)" opacity=".35"/>'+fi+'</g>'+
  '<circle class="em" cx="692" cy="526" r="10" fill="url(#'+id+'e)" opacity="0"/>';
  host.appendChild(svg);
  var cv=document.createElement("canvas");cv.style.cssText="position:absolute;inset:0;width:100%;height:100%;pointer-events:none";host.appendChild(cv);
  var vg=document.createElement("div");vg.className="vig";host.appendChild(vg);
  var q=function(c){return svg.querySelector(c)},fg=q(".fg"),lt=q(".lt"),dk=q(".dk"),sh=q(".sh"),gl=q(".gl"),em=q(".em");
  var BV=svg.querySelectorAll(".bv"),FV=svg.querySelectorAll(".fv"),curB=0,curF=0;
  var ctx=cv.getContext("2d"),W=0,H=0,dpr=Math.min(2,window.devicePixelRatio||1),SC=1,OX=0,OY=0;
  function size(){var r=host.getBoundingClientRect();W=r.width||360;H=r.height||780;cv.width=Math.round(W*dpr);cv.height=Math.round(H*dpr);
    /* 橫的螢幕（電腦）：整幅畫放進來（meet），不裁成只剩中間的地板；直的手機照舊填滿（slice） */
    var wide=W/H>.75;svg.setAttribute("preserveAspectRatio","xMidYMid "+(wide?"meet":"slice"));
    SC=wide?Math.min(W/706,H/1536):Math.max(W/706,H/1536);OX=(W-706*SC)/2-79*SC;OY=(H-1536*SC)/2}
  size();addEventListener("resize",size);
  var rnd=(function(a){return function(){a=(a*16807)%2147483647;return(a-1)/2147483646}})(seed*7919+13);
  function cl(v,a,b){return v<a?a:(v>b?b:v)}
  this.out=0;this.flow=true;var gusts=[],nextG=2+rnd()*3,nextDip=4+rnd()*4,dipAt=-99,dipDrop=.3,dipRec=1,lean=0,outCur=0,last=-1,t0=performance.now();
  var smoke=[],D=[];
  for(var i=0;i<46;i++){var z=rnd()<.15?1.7+rnd()*.6:.5+rnd()*.9;D.push({x:79+rnd()*706,y:rnd()*1536,z:z,ph:rnd()*50})}
  function frame(now){
    var t=(now-t0)/1000,k=Math.floor(t/STEP);
    if(k!==last){ last=k;var tq=k*STEP,dt=STEP;
    /* 換一張預先畫好的底圖與火（隨機，不照順序，才不會看出循環） */
    if(self.flow&&k%2===0){var nb=Math.floor((hsh(k,seed+71)*.5+.5)*BV.length)%BV.length;if(nb===curB)nb=(nb+1)%BV.length;BV[curB].setAttribute("visibility","hidden");BV[nb].setAttribute("visibility","visible");curB=nb}
    var nf=Math.floor((hsh(k,seed+83)*.5+.5)*FV.length)%FV.length;if(nf===curF)nf=(nf+1)%FV.length;FV[curF].setAttribute("visibility","hidden");FV[nf].setAttribute("visibility","visible");curF=nf;
    /* 風：慢慢變的底＋不定時的陣風（有起有落，不規律） */
    if(tq>nextG){gusts.push([tq,(rnd()<.55?1:-1)*(.4+rnd()*.9)]);nextG=tq+1.5+rnd()*6.5}
    var gs=0;gusts=gusts.filter(function(g){var a=tq-g[0];if(a>6)return false;gs+=g[1]*(a<.22?a/.22:Math.exp(-(a-.22)/.8));return true});
    var wind=.5*fbm(tq*.4,seed)+gs;
    lean+=(cl(wind*9,-18,18)-lean)*.28;                                            /* 火跟風有一點延遲 */
    var flick=fbm(tq*9,seed+50);                                                     /* 真的火一秒抖好幾次 */
    if(tq>nextDip){dipAt=tq;dipDrop=.2+rnd()*.3;dipRec=.7+rnd()*1.4;nextDip=tq+4+rnd()*9}
    var a=tq-dipAt,dip=a<0?0:(a<dipDrop?a/dipDrop:(a<dipDrop+dipRec?1-(a-dipDrop)/dipRec:0));dip=dip*dip*(3-2*dip);
    var lifeT=(1+.22*fbm(tq*.8,seed+20))*(1-.9*dip)*(1+.2*dip*vn(tq*15,seed+9));
    outCur+=(self.out-outCur)*(self.out>outCur?.32:.22);
    var life=Math.max(.04,lifeT*(1-outCur)+.04*outCur);
    var sy=life*(1+.09*flick)*(1-.1*Math.min(1.5,Math.abs(wind))),sx=(.76+.24*Math.min(1.2,life))*(1-.05*flick);
    fg.setAttribute("transform","translate(692 528) skewX("+(-lean).toFixed(2)+") scale("+sx.toFixed(3)+" "+sy.toFixed(3)+") translate(-692 -528)");
    fg.setAttribute("opacity",cl(.2+life,0,1).toFixed(3));
    var area=cl(sx*sy,0,1.4),I=cl(.03+.97*Math.pow(area,1.3)*(.9+.1*flick),.03,1.25);  /* 亮度跟火的大小走：火小，整個房間就暗 */
    gl.setAttribute("opacity",cl(.06+.36*I,0,1).toFixed(3));
    lt.setAttribute("opacity",cl(I*.95,0,1).toFixed(3));
    dk.setAttribute("opacity",cl((1-I)*.9,0,.88).toFixed(3));
    sh.setAttribute("transform","translate("+(-lean*2).toFixed(1)+" 0)");sh.setAttribute("opacity",cl(.25+.45*I,0,1).toFixed(3));
    em.setAttribute("opacity",(cl((.38-life)*3,0,1)*(.7+.3*hsh(k,3))).toFixed(3));  /* 火快沒時，燈芯那一點火心 */
    /* 煙與塵畫在一張畫布上（用事先畫好的顏料團，不用濾鏡） */
    ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,cv.width,cv.height);
    ctx.setTransform(dpr*SC,0,0,dpr*SC,dpr*OX,dpr*OY);
    var tipY=528-170*sy,tipX=692+Math.tan(lean*Math.PI/180)*170*sy,dense=Math.max(outCur,dip);
    var n=1+(dense>.35?2:0);for(var j=0;j<n;j++)smoke.push({x:tipX+(rnd()-.5)*4,y:tipY-4,r:5+rnd()*3,o:.07+.2*dense,vx:(rnd()-.5)*8,vy:-(34+rnd()*18),age:0,L:2.4+rnd()*1.6,s:rnd()*40});
    ctx.globalCompositeOperation="source-over";
    smoke=smoke.filter(function(p){p.age+=dt;if(p.age>p.L)return false;
      p.vx+=wind*26*dt+vn(p.age*1.3+p.s,seed+3)*10*dt;p.vy*=.985;p.x+=p.vx*dt;p.y+=p.vy*dt;p.r+=9*dt;
      var o=p.o*(1-p.age/p.L)*(p.age<.3?p.age/.3:1)*(.6+.4*I+.5*dense);
      ctx.globalAlpha=cl(o,0,1);ctx.drawImage(SMOKE_IMG,p.x-p.r*.9,p.y-p.r*1.4,p.r*1.8,p.r*2.8);return true});
    ctx.globalCompositeOperation="lighter";
    for(var j=0;j<D.length;j++){var p=D[j];
      var dx=p.x-692,dy=p.y-470,vx=(wind*20+vn(tq*.3+p.ph,seed+30)*7)*p.z,vy=(vn(tq*.25+p.ph,seed+40)*6-2)*p.z;
      if(Math.abs(dx)<110&&dy<0&&dy>-520)vy-=28*(1-Math.abs(dx)/110);
      p.x+=vx*dt;p.y+=vy*dt;if(p.x<79)p.x+=706;if(p.x>785)p.x-=706;if(p.y<0)p.y+=1536;if(p.y>1536)p.y-=1536;
      var lit=I*Math.pow(Math.max(0,1-Math.sqrt(dx*dx+dy*dy)/720),1.5);if(lit<.025)continue;
      var big=p.z>1.6,r=big?(10+p.z*3):(2+p.z*1.6);
      ctx.globalAlpha=cl(big?(.04+.14*lit):lit*1.1,0,.9);ctx.drawImage(DUST_IMG,p.x-r,p.y-r,r*2,r*2)}
    ctx.globalAlpha=1;ctx.globalCompositeOperation="source-over";
    }
    if(!RM&&!manual)self.raf=requestAnimationFrame(frame);
  }
  this.frameAt=function(ms){frame(t0+ms)};
  this.start=function(){cancelAnimationFrame(self.raf);t0=performance.now();last=-1;if(!manual)self.raf=requestAnimationFrame(frame)};
  this.kick=function(m){var tq=manual?last*STEP:Math.floor((performance.now()-t0)/1000/STEP)*STEP;gusts.push([tq,m]);nextG=tq+4;nextDip=tq+7};
  this.start();
}

  var css = ".kl{position:fixed;inset:0;z-index:5;overflow:hidden;background:#140C07;transition:opacity .5s ease}" +
    ".kl .kl-sc{position:absolute;inset:0;background:#140C07 url('" + P + "poster.jpg') center/cover}" +
    ".kl .kl-sc svg{position:absolute;inset:0;width:100%;height:100%;display:block}" +
    ".kl .vig{position:absolute;inset:0;pointer-events:none;background:radial-gradient(120% 80% at 55% 38%,transparent 45%,rgba(8,4,2,.55))}" +
    ".kl .kl-br{position:absolute;left:0;right:0;top:63%;text-align:center;margin:0;font:600 24px Cinzel,Georgia,serif;letter-spacing:.6em;padding-left:.6em;color:#F3EADD;text-shadow:0 1px 14px rgba(0,0,0,.7);transition:opacity .6s ease}" +
    ".kl .kl-st{position:absolute;left:16px;right:16px;bottom:calc(env(safe-area-inset-bottom,0px) + 54px);text-align:center;font:500 14px -apple-system,'Noto Sans TC',sans-serif;color:#CDBBA2;text-shadow:0 1px 10px rgba(0,0,0,.8);transition:opacity .4s ease}" +
    ".kl .kl-day{position:absolute;inset:0;opacity:0;pointer-events:none;background:linear-gradient(158deg,#F5F0E6,#ECE5D8 48%,#E8E0D2)}" +
    ".kl .kl-direct{position:absolute;left:50%;transform:translateX(-50%);bottom:calc(env(safe-area-inset-bottom,0px) + 14px);min-height:44px;padding:0 16px;border:0;border-radius:999px;background:rgba(20,12,7,.55);box-shadow:inset 0 0 0 1px rgba(255,236,210,.22);color:#F3EADD;font:600 14px -apple-system,'Noto Sans TC',sans-serif;opacity:0;pointer-events:none;transition:opacity .4s}" +
    ".kl .kl-direct.on{opacity:1;pointer-events:auto}" +
    ".kl.kl-em{position:absolute;z-index:0}.kl.kl-em .kl-st,.kl.kl-em .kl-direct{display:none}" +
    /* 橫的螢幕（電腦）：整幅畫完整放中間，兩側用同一張畫模糊變暗補滿（靜態，不跟著動） */
    "@media (min-aspect-ratio:3/4){.kl .kl-sc{background:url('" + P + "poster.jpg') center/contain no-repeat}" +
    ".kl::before{content:'';position:absolute;inset:-40px;background:url('" + P + "poster.jpg') center/cover;filter:blur(28px) brightness(.32)}}" +
    /* 登入卡：背景＝同一張畫模糊（靜態圖，不對動畫做即時模糊），前景一張夜色卡片 */
    ".kl .kl-blur{position:absolute;inset:-30px;background:#140C07 url('" + P + "poster.jpg') center/cover;filter:blur(16px) brightness(.5);opacity:0;transition:opacity .9s ease}" +
    ".kl .kl-in{position:absolute;left:50%;top:50%;box-sizing:border-box;width:min(340px,calc(100% - 40px));transform:translate(-50%,-44%);opacity:0;transition:opacity .7s ease .25s,transform .9s cubic-bezier(.2,.7,.2,1) .25s;" +
    "padding:28px 22px 22px;border-radius:14px;background:rgba(31,22,16,.72);box-shadow:inset 0 0 0 1px rgba(255,236,210,.14),8px 18px 40px -18px rgba(0,0,0,.8);text-align:center;color:#F3EADD;font-family:-apple-system,'Noto Sans TC',sans-serif}" +
    ".kl.kl-sign .kl-blur{opacity:1}.kl.kl-sign .kl-in{opacity:1;transform:translate(-50%,-50%)}.kl.kl-sign .kl-br,.kl.kl-sign .kl-st,.kl.kl-sign .kl-direct{opacity:0}" +
    ".kl .kl-in b{display:block;margin-bottom:24px;font:600 18px Cinzel,Georgia,serif;letter-spacing:.5em;padding-left:.5em}" +
    ".kl .kl-g{display:flex;align-items:center;justify-content:center;gap:10px;width:100%;min-height:48px;border:0;border-radius:999px;background:#F3EADD;color:#1F1610;font:700 16px -apple-system,'Noto Sans TC',sans-serif;cursor:pointer}" +
    ".kl .kl-g:focus-visible{outline:2px solid #F6C77E;outline-offset:3px}.kl .kl-g svg{width:18px;height:18px}";
  function mount(host, opts) {
    if (!document.getElementById("kl-css")) { var st = document.createElement("style"); st.id = "kl-css"; st.textContent = css; document.head.appendChild(st); }
    var box = document.createElement("div"); box.className = "kl" + (opts && opts.embed ? " kl-em" : "");
    box.innerHTML = '<div class="kl-sc" role="img" aria-label="一盞點亮的陶燈，油畫"></div><h1 class="kl-br">KYNIZM</h1>' +
      '<div class="kl-st" role="status" aria-live="polite"></div><div class="kl-day" aria-hidden="true"></div><button type="button" class="kl-direct">等很久？按這裡直接開啟</button>';
    host.appendChild(box);
    var q = function (c) { return box.querySelector(c); }, sc = q(".kl-sc"), t0 = performance.now(), entering = false;
    var scene = new Scene(sc, 2);
    return {
      el: box, scene: scene,
      status: function (t) { q(".kl-st").textContent = t || ""; },
      direct: function (fn) { var b = q(".kl-direct"); b.classList.add("on"); b.onclick = fn; },
      /* 需要登入 Google（或這台不能在框裡開 App）：燈淡成模糊背景，前景浮出登入卡；按了才走 go */
      signin: function (go) {
        if (box.classList.contains("kl-sign")) return;
        var c = document.createElement("div"); c.className = "kl-blur"; box.insertBefore(c, q(".kl-day"));
        var d = document.createElement("div"); d.className = "kl-in"; d.setAttribute("role", "dialog"); d.setAttribute("aria-label", "登入");
        d.innerHTML = "<b>KYNIZM</b><button type=\"button\" class=\"kl-g\">" +
          '<svg viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.6 5.4 2.7 13.3l7.9 6.1C12.5 13.6 17.8 9.5 24 9.5z"/><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.7 6c4.5-4.2 6.9-10.3 6.9-17.7z"/><path fill="#FBBC05" d="M10.6 28.6c-.5-1.4-.8-3-.8-4.6s.3-3.2.8-4.6l-7.9-6.1C1 16.6 0 20.2 0 24s1 7.4 2.7 10.7l7.9-6.1z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.7-6c-2.1 1.4-4.9 2.3-8.2 2.3-6.2 0-11.5-4.1-13.4-9.9l-7.9 6.1C6.6 42.6 14.6 48 24 48z"/></svg>' +
          "使用 Google 繼續</button>";
        box.insertBefore(d, q(".kl-day")); void d.offsetWidth; box.classList.add("kl-sign");
        setTimeout(function () { cancelAnimationFrame(scene.raf); }, 1000);   /* 背景已模糊：燈停下來省電 */
        var btn = d.querySelector(".kl-g"); btn.onclick = function () { btn.disabled = true; btn.style.opacity = ".7"; go && go(); };
        setTimeout(function () { try { btn.focus({ preventScroll: true }); } catch (e) {} }, 900);
      },
      enter: function (done) {
        if (entering) return; entering = true;
        var quick = (performance.now() - t0) / 1000 < 1.2 || RM, day = q(".kl-day");
        q(".kl-st").style.opacity = 0; q(".kl-br").style.opacity = 0; q(".kl-direct").classList.remove("on");
        var T = function (ms, f) { setTimeout(f, RM ? 0 : ms); };
        var dawn = function (dur) {
          sc.style.transition = "filter " + dur + "s ease-in-out"; sc.style.filter = "brightness(2.5) saturate(.5) blur(3px)";
          T(dur * 400, function () { day.style.transition = "opacity " + dur + "s ease-in-out"; day.style.opacity = 1; });
          T(dur * 1000 + 300, function () { done && done(); box.style.opacity = 0; T(550, function () { cancelAnimationFrame(scene.raf); box.remove(); }); });
        };
        if (quick) return dawn(.7);
        scene.kick(1.6); scene.out = 1;            /* 一陣風，火縮成燈芯上一點火心 */
        T(600, function () { scene.out = 0; });    /* 重燃 */
        T(900, function () { dawn(1); });          /* 天亮 */
      }
    };
  }
  window.KLamp = { mount: mount };
})();
