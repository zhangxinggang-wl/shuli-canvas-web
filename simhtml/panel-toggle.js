/* 给四个独立仿真页补「收起 / 展开参数面板」按钮。
 * 这四页没有走 sim.js（那套已经自带 #panel-toggle），所以在这里统一补一个。
 */
(function () {
  'use strict';
  if (document.getElementById('panel-toggle')) return;
  const panel = document.getElementById('panel') || document.querySelector('.panel') || document.getElementById('ui');
  if (!panel) return;
  const btn = document.createElement('button');
  btn.id = 'panel-toggle';
  btn.type = 'button';
  btn.title = '收起 / 展开右侧参数面板';
  btn.textContent = '▾ 收起';
  const sync = (hidden) => {
    document.body.classList.toggle('panel-hidden', hidden);
    btn.textContent = hidden ? '☰ 参数' : '▾ 收起';
    btn.title = hidden ? '展开右侧参数面板' : '收起右侧参数面板';
    window.dispatchEvent(new Event('resize'));
  };
  btn.addEventListener('click', () => sync(!document.body.classList.contains('panel-hidden')));
  document.body.appendChild(btn);
})();
