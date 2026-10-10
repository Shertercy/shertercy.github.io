/*works.js 作品侧边栏与正文加载
  要加作品请改 works-list.js，这个文件平时不用动*/

(function () {
    'use strict';

    const toggleButton   = document.getElementById('worksToggle');
    const sidebar        = document.getElementById('WorksSidebar');
    const contentElement = document.getElementById('WorksContent');
    const titleElement   = document.getElementById('TopBarTitle');
    const metaElement     = document.getElementById('WorksMeta');
    const metaTextElement = document.getElementById('WorksMetaText');

    /*清单文件写坏了的时候，给一句人话，而不是让整个功能静悄悄地死掉*/
    if (typeof WORKS === 'undefined') {
        contentElement.textContent =
            '你遇到了一个Shertercy的重大失误！\n' +
            '因为一些问题，现在网站的功能已基本瘫痪。她应当向你道歉。\n\n' +
            '具体的逻辑是：作品清单（works-list.js）里有语法错误，浏览器没能成功读取它。\n' +
            '按 F12 打开控制台，第一行红色报错会指出大概在哪一行。\n' +
            '请联系Shertercy，并让她尽快修复这个问题。这是她的义务。\n\n' +
            '……如果你还留在这里，不妨深呼吸一下，然后喝口水。不管你是谁，Shertercy都希望你能照顾好自己。';
        return;
    }

    const SITE_NAME   = 'Shertercy';
    const STORAGE_KEY = 'shertercy.reading';

    /*已取回的正文。点过的再点回去就是瞬时的*/
    const documentCache = {};

    /*路径 → { item, trail }。顺便当白名单：不在里面的路径一律不加载*/
    const itemsByPath = {};

    /*当前正文是谁。存滚动位置时要知道存给哪一篇*/
    let currentDocumentPath = '';

    /* ==================== 阅读状态 ==================== */

    /*last       上次读到哪一篇
      progress   每一篇读到全篇的百分之多少（0到1之间的小数）
      collapsed  哪些目录被收起来了*/
    const readingState = { last: '', progress: {}, collapsed: {} };

    function loadReadingState() {
        try {
            const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
            if (saved.last)      readingState.last = saved.last;
            if (saved.progress)  readingState.progress = saved.progress;
            if (saved.collapsed) readingState.collapsed = saved.collapsed;
        } catch (error) { /*存不了就算了，不影响阅读*/ }
    }

    function saveReadingState() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(readingState));
        } catch (error) { /*隐私模式下存不了，本次会话仍然生效*/ }
    }

    function saveScrollPosition() {
        if (!currentDocumentPath) return;

        /*存"读到全篇的百分之多少"，而不是像素。
          这样换了字号、行距、窗口宽度之后，位置的含义都不会变*/
        const page = document.documentElement;
        const scrollable = page.scrollHeight - page.clientHeight;
        readingState.progress[currentDocumentPath] = scrollable > 0 ? window.scrollY / scrollable : 0;
        saveReadingState();
    }

    loadReadingState();

    /* ==================== 清单 ==================== */

    function collectPaths(items, trail) {
        items.forEach(item => {
            const nextTrail = trail.concat(item.name);

            if (item.path) itemsByPath[item.path] = { item: item, trail: nextTrail };
            if (item.children) collectPaths(item.children, nextTrail);
        });
    }
    collectPaths(WORKS, []);

    /*默认页即使没登记在清单里，也要能打开*/
    if (DEFAULT_PATH && !itemsByPath[DEFAULT_PATH]) {
        itemsByPath[DEFAULT_PATH] = { item: { name: '首页', path: DEFAULT_PATH }, trail: [] };
    }

    /* ==================== 侧边栏 ==================== */

    /*有children的是一层目录（可以折叠），有path的才是能打开的文档*/
    function renderItems(items, depth, trail) {
        return items
            .filter(item => item.path || (item.children && item.children.length > 0))
            .map(item => {
                if (!item.children) {
                    return `<a class="WorksLink" href="#${item.path}">${item.name}</a>`;
                }

                const nextTrail  = trail.concat(item.name);
                const groupKey   = nextTrail.join(' / '); /*折叠状态用这条路径当名字*/
                const collapsed  = readingState.collapsed[groupKey] ? ' isCollapsed' : '';

                return `<div class="WorksGroup${collapsed}" style="--depth:${depth}">
                            <div class="WorksGroupName" data-group-key="${groupKey}">
                                <span class="WorksGroupArrow">▾</span>${item.name}
                            </div>
                            <div class="WorksGroupChildren" style="--depth:${depth + 1}">
                                ${renderItems(item.children, depth + 1, nextTrail)}
                            </div>
                        </div>`;
            })
            .join('');
    }

    function renderSidebar() {
        sidebar.innerHTML = renderItems(WORKS, 0, []);
    }

    function highlightLink(path) {
        sidebar.querySelectorAll('.WorksLink').forEach(link => {
            link.classList.toggle('isCurrent', link.getAttribute('href') === '#' + path);
        });
    }

    /* ==================== 正文 ==================== */

    async function fetchText(path) {
        if (documentCache[path]) return documentCache[path];

        const response = await fetch(path);
        if (!response.ok) throw new Error('没找到这篇');

        const text = await response.text();
        documentCache[path] = text;
        return text;
    }

    /*先取回、再替换。中间那段时间屏幕上是旧内容，所以不闪*/
    async function showDocument(path) {
        const entry = itemsByPath[path];
        if (!entry) return; /*不在清单里的路径，什么都不做*/

        /*切走之前，先把上一篇读到哪儿记下来*/
        saveScrollPosition();

        /*标题和日期立刻更新，不等正文。
          否则网络慢的时候，顶栏会先亮着初始值再跳变*/
        if (entry.trail.length) {
            titleElement.textContent = entry.trail.join(' / ');
            document.title = entry.item.name + ' - ' + SITE_NAME;
        } else {
            titleElement.textContent = '';
            document.title = SITE_NAME;
        }
        showMeta(entry.item);
        highlightLink(path);

        try {
            const text = await fetchText(path);
            contentElement.textContent = text;

            currentDocumentPath = path;
            readingState.last = path;
            saveReadingState();

            restoreScrollPosition(path);
        } catch (error) {
            contentElement.textContent =
                '文件读取失败：' + path + '\n\n' +
                '可能是文件不存在，也有可能是Shertercy的失误导致。\n\n' +
                '具体的逻辑是：作品清单（works-list.js）指定了不存在的文件。\n' +
                '这不算是一个重大失误，但仍然可以联系Shertercy，并向她报告这个问题。\n\n' +
                '你喜欢茶，咖啡，还是能量饮料？无论你有多么喜欢它们，也不要忘记喝水哦。';
        }
    }

    function restoreScrollPosition(path) {
        const fraction = readingState.progress[path] || 0; /*没读过就从顶上开始*/

        /*等浏览器把新内容排好版再滚，否则算不出正确的总高度*/
        requestAnimationFrame(() => {
            const page = document.documentElement;
            const scrollable = Math.max(0, page.scrollHeight - page.clientHeight);
            window.scrollTo(0, fraction * scrollable);
        });
    }

    /*日期是可选的：清单里写了才显示，都没写就整个收起来*/
    function showMeta(item) {
        const parts = [];
        if (item.created) parts.push('创建于 ' + item.created);
        if (item.updated) parts.push('最后修改 ' + item.updated);

        metaTextElement.textContent = parts.join(' · ');
        metaElement.hidden = parts.length === 0; /*没日期就整块不出现*/
    }

    /* ==================== 地址栏 ==================== */

    /*万一百分号不完整，decodeURIComponent会抛错，原样返回就好*/
    function safeDecode(text) {
        try {
            return decodeURIComponent(text);
        } catch (error) {
            return text;
        }
    }

    /*不同浏览器给location.hash的形式不一样（有的编码有的不编码），两种都试*/
    function currentPath() {
        const raw = location.hash.slice(1); /*去掉开头的#*/
        return itemsByPath[raw] ? raw : safeDecode(raw);
    }

    function openFromHash() {
        const path = currentPath();

        if (itemsByPath[path]) {
            showDocument(path);
            return;
        }

        if (location.hash) return; /*是个对不上的#，什么都不做*/

        /*地址栏里没指定哪一篇：接着上次读，没有上次就读首页*/
        if (RESUME_LAST_READING && itemsByPath[readingState.last]) {
            showDocument(readingState.last);
        } else if (itemsByPath[DEFAULT_PATH]) {
            showDocument(DEFAULT_PATH);
        }
    }

    /* ==================== 侧边栏开关与折叠 ==================== */

    function setSidebarOpen(open) {
        sidebar.classList.toggle('isOpened', open);
        document.body.classList.toggle('isWorksOpen', open);
        toggleButton.setAttribute('aria-expanded', String(open));
    }

    toggleButton.addEventListener('click', () => {
        setSidebarOpen(!sidebar.classList.contains('isOpened'));
    });

    sidebar.addEventListener('click', event => {
        /*点目录名＝折叠或展开。只改一个class，不重画整个侧边栏，
          这样侧边栏自己的滚动位置不会跳回去*/
        const groupName = event.target.closest('.WorksGroupName');
        if (!groupName) return;

        const collapsed = groupName.parentElement.classList.toggle('isCollapsed');
        readingState.collapsed[groupName.dataset.groupKey] = collapsed;
        saveReadingState();
    });

    /*链接本身就是 #/作品/... ，所以点它等于改地址栏，浏览器自己会记历史*/
    window.addEventListener('hashchange', () => {
        openFromHash();

        /*窄屏幕上选完就收起来，否则它会一直盖着正文*/
        if (window.matchMedia('(max-width: 700px)').matches) setSidebarOpen(false);
    });

    /*悬停时先取回来，点下去就是瞬时的*/
    sidebar.addEventListener('mouseover', event => {
        const link = event.target.closest('.WorksLink');
        if (!link) return;

        const raw = link.getAttribute('href').slice(1);
        const path = itemsByPath[raw] ? raw : safeDecode(raw);
        if (itemsByPath[path]) fetchText(path).catch(() => {});
    });

    /* ==================== 记录滚动位置 ==================== */

    /*故意不在scroll事件里存。
      滚动的时候页面高度随时在变，浏览器会把滚动位置"夹"在合法范围内，
      于是很容易把夹住之后的错误数字存下去。
      只在两个确定的时机存：切走之前（showDocument开头）、关页面之前（pagehide）*/
    window.addEventListener('pagehide', saveScrollPosition);

    /* ==================== 启动 ==================== */

    renderSidebar();
    openFromHash();

})();
