/* Top banner on the home page: alternates the Nziza Basketball Academy ad and the Lesson Maker (REB) ad.
   Each ad appears, holds, disappears, then the other one takes over (16s loop, 8s each).
   Remove the <script src="/js/top-ads.js"> line from index.html to hide it. */
(function () {
  if (document.getElementById('topads')) return;

  var font = document.createElement('link');
  font.rel = 'stylesheet';
  font.href = 'https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@500;700;800&display=swap';
  document.head.appendChild(font);

  var css = `
#topads{position:relative;z-index:200;width:100%;box-sizing:border-box;display:grid;overflow:hidden;background:#141c40;color:#fff;font-family:"Barlow Condensed","Arial Narrow",sans-serif}
#topads .sl{grid-area:1/1;box-sizing:border-box;visibility:hidden;opacity:0;border-bottom:5px solid #e8732a;animation:taVis 16s var(--base,0s) infinite}
#topads .sl.b{--base:8s}
#topads .nz{background:linear-gradient(100deg,#141c40 0%,#1f2a5e 55%,#2a3a7a 100%);border-bottom-color:#e8732a}
#topads .lm{background:linear-gradient(110deg,#0E1C2B 0%,#17324d 100%);border-bottom-color:#D3242C}
#topads .in{max-width:1100px;margin:0 auto;padding:12px 52px 12px 24px;min-height:110px;display:flex;align-items:center;justify-content:space-between;gap:20px;box-sizing:border-box}
#topads .tx{display:flex;flex-direction:column;gap:6px;flex:1}
#topads .ey{font-size:16px;font-weight:700;letter-spacing:3px;text-transform:uppercase;color:#e8732a}
#topads .lm .ey{color:#F2C879}
#topads .hd{font-size:36px;font-weight:800;line-height:1;text-transform:uppercase}
#topads .lm .hd em{font-style:normal;color:#F2C879}
#topads .rw{display:flex;align-items:center;flex-wrap:wrap;gap:8px 14px}
#topads .pill{display:inline-block;background:#e8732a;color:#fff!important;text-decoration:none;font-size:26px;font-weight:800;padding:4px 16px;border-radius:40px;white-space:nowrap}
#topads .lm .pill{background:#D3242C}
#topads .wh{font-size:20px;font-weight:500}
#topads svg{flex:none;width:96px;height:96px}
#topads .x{position:absolute;z-index:3;top:8px;right:10px;width:32px;height:32px;border:0;border-radius:50%;background:rgba(255,255,255,.15);color:#fff;font-size:20px;line-height:1;cursor:pointer}
#topads .e{animation:taSlide 16s calc(var(--base,0s) + var(--d,0s)) ease-in-out infinite both}
#topads .po{animation:taPop 16s calc(var(--base,0s) + var(--d,0s)) ease-in-out infinite both}
#topads .pu{animation:taPop 16s calc(var(--base,0s) + var(--d,0s)) ease-in-out infinite both,taPulse 1.8s ease-in-out infinite}
#topads .bo{animation:taPop 16s calc(var(--base,0s) + var(--d,0s)) ease-in-out infinite both,taBounce 1.6s ease-in-out infinite}
#topads .fl{animation:taPop 16s calc(var(--base,0s) + var(--d,0s)) ease-in-out infinite both,taFloat 2.4s ease-in-out infinite}
@keyframes taVis{0%{opacity:0;visibility:visible}3%{opacity:1;visibility:visible}44%{opacity:1;visibility:visible}47%{opacity:0;visibility:visible}48%,100%{opacity:0;visibility:hidden}}
@keyframes taSlide{0%{opacity:0;translate:-40px 0}4%{opacity:1;translate:0 0}38%{opacity:1;translate:0 0}44%,100%{opacity:0;translate:40px 0}}
@keyframes taPop{0%{opacity:0;scale:.6}4%{opacity:1;scale:1.08}5.5%{opacity:1;scale:1}38%{opacity:1;scale:1}44%,100%{opacity:0;scale:.6}}
@keyframes taPulse{0%,100%{transform:scale(1);box-shadow:0 0 0 0 rgba(232,115,42,.6)}50%{transform:scale(1.06);box-shadow:0 0 0 10px rgba(232,115,42,0)}}
@keyframes taBounce{0%,100%{transform:translateY(-8px) rotate(0)}50%{transform:translateY(8px) rotate(180deg)}}
@keyframes taFloat{0%,100%{transform:translateY(-5px)}50%{transform:translateY(5px)}}
@media (prefers-reduced-motion:reduce){#topads .sl.a{visibility:visible;opacity:1}#topads .sl.b{display:none}#topads *{animation:none!important}}
@media (max-width:640px){#topads .in{padding:8px 40px 8px 12px;min-height:0;gap:10px}#topads .tx{gap:4px}#topads .hd{font-size:19px}#topads .ey{font-size:12px;letter-spacing:1.5px}#topads .pill{font-size:18px;padding:3px 12px}#topads .wh{font-size:14px}#topads svg{width:44px;height:44px}#topads .x{width:28px;height:28px;top:6px;right:6px}}
`;
  var style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  var ball = '<svg class="bo" style="--d:.4s" viewBox="0 0 150 150" role="img" aria-label="Basketball">' +
    '<circle cx="75" cy="75" r="70" fill="#e8732a"/>' +
    '<g fill="none" stroke="#1f2a5e" stroke-width="5"><line x1="75" y1="5" x2="75" y2="145"/><line x1="5" y1="75" x2="145" y2="75"/><path d="M24 26C55 55 55 95 24 124"/><path d="M126 26C95 55 95 95 126 124"/></g>' +
    '<circle cx="75" cy="75" r="70" fill="none" stroke="#fff" stroke-width="3"/></svg>';

  var sheet = '<svg class="fl" style="--d:.4s" viewBox="0 0 120 120" role="img" aria-label="Lesson plan, 50 RWF">' +
    '<g transform="rotate(6 60 60)"><rect x="20" y="8" width="76" height="100" fill="#fff"/>' +
    '<rect x="29" y="18" width="42" height="6" fill="#12202F"/><rect x="29" y="30" width="58" height="4" fill="#D3242C"/>' +
    '<rect x="29" y="44" width="58" height="4" fill="#E7E7E9"/><rect x="29" y="53" width="42" height="4" fill="#E7E7E9"/>' +
    '<rect x="29" y="66" width="58" height="4" fill="#E7E7E9"/><rect x="29" y="75" width="58" height="4" fill="#E7E7E9"/>' +
    '<rect x="29" y="84" width="34" height="4" fill="#E7E7E9"/></g>' +
    '<circle cx="92" cy="90" r="25" fill="#D3242C" stroke="#F2C879" stroke-width="3"/>' +
    '<text x="92" y="92" text-anchor="middle" fill="#fff" font-size="22" font-weight="800" font-family="Barlow Condensed,Arial Narrow,sans-serif">50</text>' +
    '<text x="92" y="105" text-anchor="middle" fill="#fff" font-size="10" font-weight="700" font-family="Barlow Condensed,Arial Narrow,sans-serif">RWF</text></svg>';

  var el = document.createElement('div');
  el.id = 'topads';
  el.setAttribute('role', 'region');
  el.setAttribute('aria-label', 'Announcements');
  el.innerHTML =
    '<div class="sl nz a"><div class="in"><div class="tx">' +
      '<div class="ey e" style="--d:0s">Nziza Basketball Academy</div>' +
      '<div class="hd e" style="--d:.2s">Join the court. Be part of the team!</div>' +
      '<div class="rw"><a class="pill pu" style="--d:.7s" href="tel:+250783566384">Call 0783566384</a>' +
      '<div class="wh e" style="--d:.9s">to register &nbsp;|&nbsp; <b>Musanze Youth Center</b></div></div>' +
    '</div>' + ball + '</div></div>' +
    '<div class="sl lm b"><div class="in"><div class="tx">' +
      '<div class="ey e" style="--d:0s">For Rwandan teachers</div>' +
      '<div class="hd e" style="--d:.2s">Your REB lesson plan, <em>ready to print.</em></div>' +
      '<div class="rw"><a class="pill pu" style="--d:.7s;animation-name:taPop,taPulseR" href="/lesson-maker/">Create a lesson plan</a>' +
      '<div class="wh e" style="--d:.9s"><b>50 RWF</b> per plan &nbsp;|&nbsp; pay with MTN MoMo</div></div>' +
    '</div>' + sheet + '</div></div>' +
    '<button class="x" type="button" aria-label="Close banner">&times;</button>';

  /* red glow for the Lesson Maker button */
  var extra = document.createElement('style');
  extra.textContent = '@keyframes taPulseR{0%,100%{transform:scale(1);box-shadow:0 0 0 0 rgba(211,36,44,.6)}50%{transform:scale(1.06);box-shadow:0 0 0 10px rgba(211,36,44,0)}}';
  document.head.appendChild(extra);

  el.querySelector('.x').onclick = function () { el.remove(); };
  document.body.insertBefore(el, document.body.firstChild);
})();
