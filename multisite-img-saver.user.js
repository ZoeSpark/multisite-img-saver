// ==UserScript==
// @name         Multisite Image Saver
// @namespace    https://github.com/ZoeSpark/multisite-img-saver
// @version      1.1.0
// @description  Tampermonkey script for multi-site image download
// @author       ZoeSpark
// @match        https://mp.weixin.qq.com/s*
// @match        *://*.weibo.com/*
// @match        *://*.weibo.cn/*
// @match        https://sspai.com/post/*
// @match        https://www.bilibili.com/opus/*
// @grant        GM_addStyle
// @grant        GM_download
// ==/UserScript==

(function () {
    'use strict';

    /* ---------- 1. 右下角按钮 ---------- */
    GM_addStyle(`
    #imgDlBtn{
      position:fixed;right:24px;bottom:24px;z-index:2147483647;
      width:56px;height:56px;border-radius:50%;
      background:#07c160;color:#fff;font-size:28px;
      text-align:center;line-height:56px;cursor:pointer;
      box-shadow:0 4px 12px rgba(0,0,0,.25);user-select:none;
    }
    #imgDlBtn:hover{filter:brightness(1.1);}
  `);
    const btn = document.createElement('div');
    btn.id = 'imgDlBtn';
    btn.textContent = '💾';
    btn.title = '下载正文配图';
    btn.onclick = downloadAll;
    document.body.appendChild(btn);

    /* ---------- 2. 环境判定 ---------- */
    const host = location.hostname;
    const isWx = /mp\.weixin\.qq\.com$/.test(host);
    const isSP = /sspai\.com$/.test(host);
    const isWb = /(weibo\.(com|cn))$/.test(host) || host.includes('.weibo.');
    const isTT = isWb && /\/ttarticle\//.test(location.pathname); // 微博长文
    const isBili = /bilibili\.com$/.test(host); // Bilibili
    const safe = s => s.replace(/[\\/:"*?<>|]+/g, '_');

    /* ---------- 3. 文件名前缀 ---------- */
    const wxPrefix = (() => {
        if (!isWx) return '';
        const raw = document.querySelector('head>title')?.textContent ||
            document.querySelector('#activity-name,.rich_media_title')?.textContent || '';
        return safe(raw.trim().slice(0, 60)) || 'wx';
    })();

    const wbPrefix = (() => {
        if (!isWb) return '';
        let t = document.title.trim()
            .replace(/ - @.*?的微博 - 微博$/, '')
            .replace(/ - 微博$/, '')
            .replace(/微博正文$/, '')
            .trim();
        if (t && t !== '微博') return safe(t.slice(0, 60));
        const seg = location.pathname.split('/').filter(Boolean); // [uid, mid, …]
        return seg.length >= 2 ? `${seg[0]}_${seg[1]}` : 'weibo';
    })();

    const spPrefix = (() => {
        if (!isSP) return '';
        const raw = document.querySelector('head>title')?.textContent || '';
        return safe(raw.replace(/ - 少数派$/, '').trim().slice(0, 60)) || 'sspai';
    })();

    const biliPrefix = (() => {
        if (!isBili) return '';
        const raw = document.querySelector('head>title')?.textContent || '';
        return safe(raw.replace(/_哔哩哔哩_Bilibili$/, '').trim().slice(0, 60)) || 'bili';
    })();

    /* ---------- 4. URL → 原图 ---------- */
    function toHD(src) {
        try {
            const u = new URL(src, location.href);
            if (u.hostname.includes('mmbiz.qpic.cn')) {            // 微信
                u.pathname = u.pathname.replace(/\/\d+(?=[/?])/, '/0');
            } else if (u.hostname.includes('sinaimg.cn') ||
                u.hostname.includes('r.sinaimg.cn')) {     // 新浪图床
                u.pathname = u.pathname
                    .replace(/\/(?:thumb\d+|orj\d+|mw\d+|bmiddle)\//, '/large/')
                    .replace(/\/large\//, '/large/');
            } else if (u.hostname.includes('cdnfile.sspai.com')) { // 少数派 CDN
                u.search = '';                                       // 去除裁剪参数
            }
            return u.href;
        } catch {
            return src;
        }
    }

    /* ---------- 5. 选正文范围 ---------- */
    function getScope() {
        if (isWx) return document.querySelector('#js_content,.rich_media_content') || document;
        if (isSP) return document.querySelector('#app .article-body .content') || document;
        if (isTT) return document.querySelector('.WB_editor_iframe') ||
            document.querySelector('.main_editor') || document;
        if (isBili) return document.querySelector('#app .opus-module-content') || document;
        if (isWb) return document.querySelector('article') || document;
        return document;
    }

    /* ---------- 6. 收集图片 ---------- */
    function collectUrls() {
        const scope = getScope();
        const urls = [...new Set(
            [...scope.querySelectorAll('img')]
                .map(img =>
                    img.getAttribute('data-origin-src') || // 微博长文
                    img.dataset?.original ||     // 少数派 lazy
                    img.dataset?.src ||     // 微信懒加载
                    img.src
                )
                .filter(Boolean)
                .map(toHD)
        )];

        // 普通微博博文仅保留 /large/
        return (isWb && !isTT)
            ? urls.filter(u => /sinaimg\.cn\/large\//.test(u))
            : urls;
    }

    /* ---------- 7. 批量下载 ---------- */
    function downloadAll() {
        if (typeof GM_download !== 'function') {
            alert('脚本管理器缺少 GM_download。');
            return;
        }

        const urls = collectUrls();
        if (!urls.length) {
            alert('😕 正文里没检测到配图。');
            return;
        }

        const prefix = isWx ? wxPrefix : (isSP ? spPrefix : (isBili ? biliPrefix : wbPrefix));

        console.group('%c📸 即将下载的高清图片列表', 'color:#07c160;font-weight:bold;');
        console.table(urls);
        console.groupEnd();

        let ok = 0, fail = 0;
        urls.forEach((u, i) => {
            const ext = (u.match(/\.(jpe?g|png|gif|webp|bmp)/i) || ['.jpg'])[0];
            const name = `${prefix}_${String(i + 1).padStart(3, '0')}${ext}`;

            /* --- 根据域名设置 Referer --- */
            let headers;
            if (/sinaimg\.cn|r\.sinaimg\.cn/.test(u)) {
                headers = { Referer: 'https://weibo.com/' };
            } else if (/sspai\.com/.test(u)) {
                headers = { Referer: 'https://sspai.com/' };
            }

            GM_download({
                url: u,
                name,
                headers,
                onload: () => { ok++; report(); },
                onerror: e => { fail++; console.warn('下载失败:', u, e); report(); }
            });
        });

        function report() {
            if (ok + fail === urls.length) {
                alert(`🎉 下载触发完毕！成功 ${ok} 张，失败 ${fail} 张。`);
            }
        }
    }

    /* ---------- 8. 自动下载开关 ---------- */
    // 如果想刷新页面就自动下载，请取消下一行注释
    // window.addEventListener('load', downloadAll);
})();
