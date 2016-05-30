/*jshint esversion: 6, strict: false */
/* global chrome */
{
    let each = (col, op) => {
        if (typeof col.forEach === 'function') {col.forEach(op);}
        else {for (var i = 0; i < col.length; i++) {op(col[i], i, col);}}
    };

    let map = (col, op) => {
        var o = [];
        each(col, (...v) => o.push(op(...v)));
        return o;
    };

    let filter = (col, op) => {
        var o = [];
        each(col, (v, ...i) => op(v, ...i) && o.push(v));
        return o;
    };

    let reduce = (col, op, o) => {
        each(col, (...v) => o = op(o, ...v));
        return o;
    };

    let dominatedAdd = (col, query) => {
        if (reduce(col, (val, q) => val || query.startsWith(q), false)) {
            return col;
        } else {
            var no_child = filter(col, q => !q.startsWith(query));
            return no_child.concat(query);
        }
    };

    let safeQuerySelectorAll = q => {
        try {
            return document.querySelectorAll(q);
        } catch (DOMException) {
            return [];
        }
    };

    var RFSStatusCSS = 'position: fixed; right: 20px; top: 20px; height: 36px; width:36px;' +
        'z-index: 30000; box-shadow: 0 1px 3px rgba(0,0,0,0.3); cursor: pointer; background-color: white;' +
        'background-repeat: no-repeat; background-position: center;' +
        'background-image: url("' + chrome.extension.getURL('images/status_loaded.svg') + '")';

    let displayStatus = (type) => {
        var s;
        if (!(s = document.getElementById('rfs_status'))) {
            s = document.createElement('DIV');
            s.id = 'rfs_status';
            s.setAttribute('title', 'Restore');
            s.addEventListener('click', restore);
            document.body.appendChild(s);
        }
        if (type === 'none') {
                s.setAttribute('style', 'display: none;');
        } else if (type === 'loaded') {
                s.setAttribute('style', RFSStatusCSS);
        }
    };

    const MIN_TBLOCK_WIDTH = 400;
    const MIN_TBLOCK_HEIGHT = 30;
    const MIN_TBLOCK_LENGTH = 50;
    const TBLOCK_RE = new RegExp('[,!?，。！？⋯…]');
    const CRIT_TEXT_RATIO = 0.5;  // less than this: direct text child nodes are discarded

    const MAX_FONT_SIZE = 16;
    const OPT_LINE_HEIGHT = 1.5;  // times font size
    const OPT_LINE_WIDTH = 37;  // times font size
    const MAX_LINE_WIDTH = 43;

    var nonEng = false;

    let queries = [];
    let walkNode = (node, query) => {
        if (node.nodeType !== 1 || node.offsetWidth < MIN_TBLOCK_WIDTH) {return false;}

        var s = window.getComputedStyle(node);
        if (s.display.match(/^inline|none/) || s.visibility === 'hidden') {return false;}

        var direct = 0   // text length of direct text child nodes
          , hidden = 0   // text length of elment child nodes
          , isTBlock = false;
        each(node.childNodes, n => {
            if (n.nodeType === 1 && n.offsetWidth >= MIN_TBLOCK_WIDTH) {
                var t = n.innerText;
                hidden += t.trim().length;
                isTBlock = isTBlock || TBLOCK_RE.exec(t);
            } else if (n.nodeType === 3) {
                var d = n.data;
                direct += d.trim().length;
                isTBlock = isTBlock || TBLOCK_RE.exec(d);
            }
        });

        var cs = map(node.classList, c => '.' + c).join('');
        var id = node.id && !node.id.match(/([-_]|^)\d/) ? '#' + node.id : '';
        var sQ = (!query ? '' : (query + '>')) + node.tagName + id + cs;

        var tryAddChildren = () => {
            return reduce(node.childNodes, (val, n) => walkNode(n, sQ) || val, false);
        };
        var addSelf = () => {
            queries = dominatedAdd(queries, sQ);
        };

        if (!isTBlock || direct + hidden < MIN_TBLOCK_LENGTH) {
            return false;
        } else if (node.offsetHeight < MIN_TBLOCK_HEIGHT) {
            return tryAddChildren();
        } else {
            if (direct > CRIT_TEXT_RATIO * hidden) {
                addSelf();
                return true;
            } else {
                if (!tryAddChildren()) {addSelf();}
                return true;
            }
        }
    };

    let update = () => {
        queries.forEach(q => each(safeQuerySelectorAll(q), n => {
            var width = n.offsetWidth > (MAX_FONT_SIZE * MAX_LINE_WIDTH) ? (MAX_FONT_SIZE * OPT_LINE_WIDTH) : n.offsetWidth;
            var fsize = Math.min(MAX_FONT_SIZE, width / OPT_LINE_WIDTH);
            n.style.fontSize = fsize + 'px';
            n.style.lineHeight = fsize * OPT_LINE_HEIGHT * (nonEng ? 1.125 : 1) + 'px';
            n.style.width = width + 'px';
        }));
    };

    let saveAndUpdate = () => {
        var html = document.querySelector('html');
        var text = html.innerText;
        nonEng = text.replace(/\w/g, '').length / text.length > 0.5;
        walkNode(html);
        console.log(queries);
        queries.forEach(q => each(safeQuerySelectorAll(q), n => {
            n.__bfs_fontSize = n.style.fontSize;
            n.__bfs_lineHeight = n.style.lineHeight;
            n.__bfs_width = n.style.width;
        }));
        window.addEventListener('resize', update);
        update();
        displayStatus('loaded');
    };

    let restore = () => {
        window.removeEventListener('resize', update);
        queries.forEach(q => each(safeQuerySelectorAll(q), n => {
            n.style.fontSize = n.__bfs_fontSize;
            n.style.lineHeight = n.__bfs_lineHeight;
            n.style.width = n.__bfs_width;
        }));
        queries = [];
        displayStatus('none');
    };

    window.addEventListener('keypress', function (e) {
        if (e.which === 402) {  // alt + f
            saveAndUpdate();
        } else {
            restore();
        }
    });
}
