/* 数理无限画布 · 本机默认配置真值快照（2.1.1）
 *
 * 唯一真源：从本机**已安装并正在使用**的应用中逐项读取的真实配置，
 * 采集时间 2026-11-16 00:13:19，来源 本机 %APPDATA%/数理无限画布/Local Storage/leveldb/000146.log（gewu.settings）。
 * 两源比对：leveldb 103 项 / settings-backup.json 103 项，键集合完全一致；
 * 4 项有差异（ballPos、penPredict、snapResid、uiCustom），按应用既有
 * 「localStorage 优先于文件备份」规则取 leveldb 值。
 *
 * 本文件由 .tmp/gen-factory-defaults.py 生成：**逐项照抄，不猜测、不补齐、不改写任何值**。
 * GW.FACTORY_CONFIG 共 112 项，与 src/core/storage.js 的 DEFAULTS 键集合一一对应。
 * 2.2.8 新增 1 项（castBuffer：投屏接收缓冲档位），取自产品默认值（本机 2.2.7 无此项）。
 *
 * 2.1.1 新增 3 项交互配置（ballSummon / ptrDot / ptrIdleMs）：
 * 采集时本机还没有这两项功能，取的是产品默认值，不是采集到的值。
 *
 * 修改默认配置时请重新采集真值并重新生成，不要手改下面的数值。
 */
(function () {
  'use strict';
  const GW = window.GW;

  // 全部 111 项真实值（键序与 DEFAULTS 一致）
  GW.FACTORY_CONFIG = {
    "inkPredict": false,
    "inkHobby": false,
    "inkCalib": false,
    "inkOffthread": false,
    "penCalib": null,
    "multiWrite": false,
    "palmErase": true,
    "gestErase": "all",
    "palmSize": 46,
    "gestEraseMigrated211": true,
    "penScaleWithZoom": false,
    "officeAutoConvert": true,
    "ggbPath": "",
    "canvasDefault": {
      "canvasMode": "free",
      "tx": 801.0134749868178,
      "ty": 503.9234643104561,
      "s": 0.7985162187593772,
      "uiCustom": {
        "slots": [
          "hand",
          "select",
          "pen",
          "hl",
          "eraser",
          "shape",
          "text",
          "laser",
          "insert",
          "math",
          "physics",
          "geo",
          "class",
          "res",
          "shelf",
          "undo",
          "redo"
        ],
        "order": [
          "hand",
          "select",
          "pen",
          "hl",
          "eraser",
          "shape",
          "text",
          "laser",
          "insert",
          "math",
          "physics",
          "geo",
          "class",
          "res",
          "shelf",
          "undo",
          "redo"
        ],
        "hidden": [
          "hl",
          "text",
          "math",
          "physics",
          "res",
          "laser",
          "class"
        ],
        "dockPos": "bottom",
        "corners": {},
        "cornersOff": []
      }
    },
    "ballPos": {
      "x": 828.9999389648438,
      "y": 677.9999694824219
    },
    "names": "",
    "rollClasses": null,
    "rollClass": "",
    "customRes": [],
    "autosave": true,
    "renderMode": "high",
    "penDevice": "auto",
    "penSmooth": 0,
    "factory209": true,
    "penTaper": 1,
    "penTilt": false,
    "penPress": 1,
    "brush": "pen",
    "penInk": "ball",
    "penTipCfg": {},
    "penTipAuto": false,
    "highlighterSnap": true,
    "textSnapLine": false,
    "layout": "paged",
    "geoUnit": "cm",
    "eraserFilter": {
      "ink": true,
      "hl": true,
      "shape": false,
      "obj": true
    },
    "eraser": {
      "mode": "area",
      "size": 36
    },
    "penTip": "sharp",
    "penExit": 1,
    "penPredict": 0,
    "freeNoticeSeen": true,
    "exportWatermark": false,
    "classroomMode": false,
    "classroomSnap": null,
    "exportQuality": "best",
    "pptxMode": "native",
    "aiPanel": true,
    "library": true,
    "resumeView": true,
    "boardClasses": {},
    "cards": [],
    "snapGrid": true,
    "snapObjects": true,
    "drawHold": false,
    "circleLasso": false,
    "teacherAnnot": true,
    "minimap": false,
    "autoContrastInk": true,
    "castBuffer": "default",
    "uiCustom": {
      "slots": [
        "hand",
        "select",
        "pen",
        "hl",
        "eraser",
        "shape",
        "text",
        "laser",
        "insert",
        "math",
        "physics",
        "geo",
        "class",
        "res",
        "shelf",
        "undo",
        "redo"
      ],
      "order": [
        "hand",
        "select",
        "pen",
        "hl",
        "eraser",
        "shape",
        "text",
        "laser",
        "insert",
        "math",
        "physics",
        "geo",
        "class",
        "res",
        "shelf",
        "undo",
        "redo"
      ],
      "hidden": [
        "hl",
        "text",
        "math",
        "physics",
        "res",
        "laser",
        "class"
      ],
      "dockPos": "bottom",
      "corners": {},
      "cornersOff": []
    },
    "customShapes": true,
    "canvasMode": "free",
    "canvasModeMigrated18": true,
    "recQuality": "tiny",
    "recMode": "screen",
    "toolCustom": {
      "hidden": {
        "pen": [],
        "shapeTabs": [],
        "mathSubs": [],
        "physSubs": [],
        "insert": [],
        "sims": [],
        "geo": [],
        "class": [],
        "resTabs": []
      },
      "extraColors": []
    },
    "dockStyle": "pill",
    "dockColor": "#1b2433",
    "customBg": "#11222e",
    "shapeAlpha": 1,
    "panelAlpha": 0.55,
    "uiAlpha": 0,
    "barTint": "#ffffff",
    "barAlpha": 1,
    "barFill": "none",
    "barRadius": 34,
    "barPad": 2,
    "btnTint": "#1b2433",
    "btnAlpha": 0,
    "barFade": false,
    "penColor": "#f2a541",
    "penWidth": 5,
    "penPreset": "default",
    "penBoardFeel": false,
    "penStyle": "solid",
    "penMode": "pen",
    "penFirst": "auto",
    "shapeMF": "cross",
    "smartSnap": "auto",
    "snapResid": 0.09,
    "hlColor": "#ffd23f",
    "hlWidth": 22,
    "barFadeTo": 0.05,
    "barEdgePeek": true,
    "barInset": 0,
    "chromePinned": true,
    "laser": {
      "color": "#ff2d55",
      "width": 5,
      "mode": "formula",
      "hold": 2
    },
    "paramAside": true,
    "paramAsideMigrated16": true,
    "recent": [
      "C:\\Users\\9800X3D\\Desktop\\课堂板书-20261108-1653.gewu"
    ],
    "defaultBg": {
      "color": "black",
      "material": "plain",
      "pattern": "none"
    },
    "bgDefaultMigrated": true,
    "lookMigrated15": true,
    "lookMigrated17": true,
    "ballSummon": true,
    "ptrDot": "auto",
    "ptrIdleMs": 3000,
    "ptrIdlePenMs": 4000,
    "ballOpen": "sector",
    "ballCustom": null,
    "smallShapeHold": true,
    "smallShapeHoldMs": 1000
  };

  // 覆盖范围分类明细（8 类，合计 112 项，无重复、无遗漏）
  GW.FACTORY_GROUPS = [
    {
      "name": "画布视图与版式",
      "count": 13,
      "keys": [
        "canvasMode",
        "layout",
        "canvasDefault",
        "defaultBg",
        "customBg",
        "renderMode",
        "penScaleWithZoom",
        "autoContrastInk",
        "shapeAlpha",
        "panelAlpha",
        "resumeView",
        "minimap",
        "canvasModeMigrated18"
      ]
    },
    {
      "name": "网格与吸附",
      "count": 11,
      "keys": [
        "snapGrid",
        "snapObjects",
        "snapResid",
        "smartSnap",
        "highlighterSnap",
        "textSnapLine",
        "geoUnit",
        "shapeMF",
        "paramAside",
        "smallShapeHold",
        "smallShapeHoldMs"
      ]
    },
    {
      "name": "笔迹与书写",
      "count": 26,
      "keys": [
        "penColor",
        "penWidth",
        "penPreset",
        "penBoardFeel",
        "penStyle",
        "penMode",
        "penFirst",
        "penInk",
        "brush",
        "penTip",
        "penExit",
        "penPredict",
        "penPress",
        "penTaper",
        "penTilt",
        "penSmooth",
        "penCalib",
        "penTipCfg",
        "penTipAuto",
        "penDevice",
        "inkPredict",
        "inkHobby",
        "inkCalib",
        "inkOffthread",
        "multiWrite",
        "paramAsideMigrated16"
      ]
    },
    {
      "name": "橡皮与手势擦除",
      "count": 7,
      "keys": [
        "eraser",
        "eraserFilter",
        "palmErase",
        "gestErase",
        "palmSize",
        "gestEraseMigrated211",
        "ballSummon"
      ]
    },
    {
      "name": "高亮·激光·图形与教具",
      "count": 9,
      "keys": [
        "hlColor",
        "hlWidth",
        "laser",
        "teacherAnnot",
        "drawHold",
        "circleLasso",
        "customShapes",
        "officeAutoConvert",
        "pptxMode"
      ]
    },
    {
      "name": "界面与工具栏外观",
      "count": 23,
      "keys": [
        "dockStyle",
        "dockColor",
        "barTint",
        "barAlpha",
        "barFill",
        "barRadius",
        "barPad",
        "btnTint",
        "btnAlpha",
        "barFade",
        "barFadeTo",
        "barEdgePeek",
        "barInset",
        "chromePinned",
        "uiAlpha",
        "uiCustom",
        "toolCustom",
        "ballPos",
        "ptrDot",
        "ptrIdleMs",
        "ptrIdlePenMs",
        "ballOpen",
        "ballCustom"
      ]
    },
    {
      "name": "导出·课堂·AI·资源与自动保存",
      "count": 12,
      "keys": [
        "castBuffer",
        "exportWatermark",
        "exportQuality",
        "classroomMode",
        "classroomSnap",
        "aiPanel",
        "library",
        "recQuality",
        "recMode",
        "autosave",
        "freeNoticeSeen",
        "ggbPath"
      ]
    },
    {
      "name": "本机数据与迁移状态",
      "count": 11,
      "keys": [
        "recent",
        "names",
        "rollClasses",
        "rollClass",
        "customRes",
        "boardClasses",
        "cards",
        "factory209",
        "bgDefaultMigrated",
        "lookMigrated15",
        "lookMigrated17"
      ]
    }
  ];

  // 不进出厂 DEFAULTS 的键：真实值仍完整保存在 FACTORY_CONFIG，恢复按钮会应用。
  GW.FACTORY_SAFE_KEYS = [
    {
      "key": "uiAlpha",
      "reason": "本机为 0（界面全透明）；照抄会让全新安装看不到任何界面（1.7.6 既定规则）"
    },
    {
      "key": "uiCustom",
      "reason": "本机隐藏了 7 个工具；照抄会把本机布局强加给新装机，首装功能不全"
    },
    {
      "key": "toolCustom",
      "reason": "本机工具定制，同上，不推广为新装机默认"
    },
    {
      "key": "recent",
      "reason": "本机最近打开的绝对路径，属私有数据"
    },
    {
      "key": "ggbPath",
      "reason": "本机 GeoGebra 离线包路径，属私有数据"
    },
    {
      "key": "ballPos",
      "reason": "本机浮动球坐标，属私有数据"
    },
    {
      "key": "names",
      "reason": "本机随机点名名单，属私有数据"
    },
    {
      "key": "rollClasses",
      "reason": "本机班级名单，属私有数据"
    },
    {
      "key": "rollClass",
      "reason": "本机当前班级 id，属私有数据"
    },
    {
      "key": "customRes",
      "reason": "本机自定义资源，属私有数据"
    },
    {
      "key": "boardClasses",
      "reason": "本机板书→班级索引，属私有数据"
    },
    {
      "key": "cards",
      "reason": "本机卡片数据，属私有数据"
    },
    {
      "key": "classroomMode",
      "reason": "临时教室模式开关，不推广为出厂默认"
    },
    {
      "key": "classroomSnap",
      "reason": "临时教室模式快照，不推广为出厂默认"
    },
    {
      "key": "freeNoticeSeen",
      "reason": "本机「已看过免费说明」状态位，新装机应保留首次说明"
    },
    {
      "key": "eraserFilter",
      "reason": "本机 shape=false / obj=true；shape=false 会让图形识别后的笔迹擦不掉（2.1.1 已修），obj=true 会让区域擦一滑删整页对象"
    },
    {
      "key": "multiWrite",
      "reason": "本机为 false；三指擦除需要允许同时上报多个触点，首装应保留 true"
    },
    {
      "key": "penBoardFeel",
      "reason": "本机为 false；红外一体机默认需要「教室白板笔锋」才落墨，首装保留 true"
    },
    {
      "key": "canvasDefault",
      "reason": "含本机视图与工具栏布局；真实值由恢复按钮应用，新装机不应自动套用隐藏工具的布局"
    },
    {
      "key": "factory209",
      "reason": "一次迁移标记（运行态），保持 DEFAULTS 原值以便老机器正常迁移"
    },
    {
      "key": "gestEraseMigrated211",
      "reason": "一次迁移标记（运行态），同上"
    },
    {
      "key": "canvasModeMigrated18",
      "reason": "一次迁移标记（运行态），同上"
    },
    {
      "key": "paramAsideMigrated16",
      "reason": "一次迁移标记（运行态），同上"
    },
    {
      "key": "bgDefaultMigrated",
      "reason": "一次迁移标记（运行态），同上"
    },
    {
      "key": "lookMigrated15",
      "reason": "一次迁移标记（运行态），同上"
    },
    {
      "key": "lookMigrated17",
      "reason": "一次迁移标记（运行态），同上"
    }
  ];

  GW.FACTORY_META = {
    "capturedAt": "2026-11-16 00:13:19",
    "source": "本机 %APPDATA%/数理无限画布/Local Storage/leveldb/000146.log（gewu.settings）",
    "fallbackSource": "%APPDATA%/数理无限画布/settings-backup.json",
    "mergeRule": "localStorage 优先于文件备份（与 src/core/storage.js 的读取顺序一致）",
    "total": 112,
    "version": "2.1.1"
  };

  // 完整默认配置（含本机私有项）：两个恢复入口都用它
  GW.factoryDefaults = () => JSON.parse(JSON.stringify(GW.FACTORY_CONFIG));

  // 出厂默认可用的那部分（剔除本机私有 / 破坏首装 / 迁移状态位）
  GW.factoryPortableDefaults = () => {
    const out = JSON.parse(JSON.stringify(GW.FACTORY_CONFIG));
    for (const it of GW.FACTORY_SAFE_KEYS) delete out[it.key];
    return out;
  };

  // 把完整默认配置逐项写回当前设置；返回实际写入的项数。
  // 只写 DEFAULTS 里存在的键，避免把运行时的临时字段带进设置。
  GW.applyFactoryDefaults = (allowed) => {
    const F = GW.FACTORY_CONFIG, S = GW.settings;
    if (!F || !S) return 0;
    let n = 0;
    for (const k of Object.keys(F)) {
      if (allowed && !Object.prototype.hasOwnProperty.call(allowed, k)) continue;
      S[k] = JSON.parse(JSON.stringify(F[k]));
      n++;
    }
    if (GW.saveSettings) { try { GW.saveSettings(); } catch (_) {} }
    return n;
  };
})();
