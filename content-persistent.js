/*jshint esversion: 6, strict: false */
/* eslint-env es6 */
/* global chrome */
{
    let each = (col, op) => {
        if (typeof col.forEach === 'function') {
            col.forEach(op);
        } else {
            for (var i = 0; i < col.length; i++) {
                op(col[i], i, col);
            }
        }
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

    let displayStatus = (type) => {
        var s;
        if (!(s = document.getElementById('rfs_status'))) {
            s = document.createElement('DIV');
            s.innerHTML = '<div></div><div></div><div></div>';
            s.id = 'rfs_status';
            s.setAttribute('title', 'Restore');
            s.addEventListener('click', restore);
            document.body.appendChild(s);

            var y = document.createElement('STYLE');
            y.innerHTML = '#rfs_status {' +
                'box-sizing: content-box;' +
                'position: fixed;' +
                'right: 20px;' +
                'bottom: 20px;' +
                'height: 22px;' +
                'width: 22px;' +
                'z-index: 30000;' +
                'padding: 4px;' +
                'box-shadow: 0 1px 3px rgba(0,0,0,0.3);' +
                'border: 3px solid white;' +
                'cursor: pointer;' +
                'background: #00c853;' +
                '}' +
                '#rfs_status > div {' +
                'height: 3px;' +
                'width: 15px;' +
                'background: white;' +
                'margin-bottom: 3px;' +
                'transition: width 0.2s;' +
                '}' +
                '#rfs_status:hover > div {' +
                'width: 22px;' +
                '}';
            document.head.appendChild(y);
        }
        if (type === 'none') {
            s.setAttribute('style', 'display: none;');
        } else if (type === 'loaded') {
            s.setAttribute('style', '');
        }
    };

    const NDEBUG = true;

    const MIN_TBLOCK_LENGTH = 150;
    const TBLOCK_RE = new RegExp('[,!?，。！？⋯…]');

    const OPT_LINE_HEIGHT = 1.5; // times font size
    const OPT_LINE_WIDTH = 37; // times font size
    const MAX_LINE_WIDTH = 39;

    var nonEng = false;

    // A list of CSS selectors
    let queries = [];

    let debugNode = (node, mess) => {
        if (NDEBUG) {
            return;
        }
        try {
            node.setAttribute('rfs_debug_message', mess);
        } catch (e) {}
    };

    const TYPE_FULL_WIDTH = 0;
    const TYPE_INLINE = 1;
    const TYPE_OFF_FLOW = 2;

    const walkNode = (node, query = '') => {
        if (node.nodeType === 3) {
            // Text node
            return {
                type: TYPE_INLINE,
                textLength: node.data.length,
                text: node.data
            };
        } else if (node.nodeType !== 1) {
            // Anything other than text/element node
            return {
                type: TYPE_OFF_FLOW,
                textLength: 0,
                text: ''
            };
        }

        // Element node
        const s = window.getComputedStyle(node);
        var cs = map(node.classList, c => '.' + c).join('');
        const nodeId = node.getAttribute('id');
        const id = nodeId && !nodeId.match(/([-_]|^)\d/) ? '#' + nodeId : '';
        var new_query = (query === '' ? '' : (query + '>')) + node.tagName + id + cs;

        if (s.display.match(/^none/) || s.visibility === 'hidden') {
            // Invisible element node
            debugNode(node, 'invisible');
            return {
                type: TYPE_FULL_WIDTH,
                textLength: 0,
                text: ''
            };
        }
        if (s.display.match(/^inline/)) {
            // Inline element node
            const [textLength, text] = reduce(node.childNodes, ([accTextLength, accText], node) => {
                const {
                    type,
                    textLength,
                    text
                } = walkNode(node, new_query);
                return [accTextLength + textLength, accText + text];
            }, [0, '']);
            debugNode(node, 'inline');
            return {
                type: TYPE_INLINE,
                textLength: textLength,
                text: text
            };
        }
        if (!s.display.match(/^(block|list-item)/)) {
            // Unresizable element node
            each(node.childNodes, n => walkNode(n, new_query));
            debugNode(node, 'unresizable elem node');
            return {
                type: TYPE_FULL_WIDTH,
                textLength: 0,
                text: ''
            };
        }

        // Resizable element node
        let [maxSectionTextLength, _1, text] = reduce(
            node.childNodes,
            ([maxSectionTextLength, accSectionTextLength, accText], node) => {
                const {
                    type,
                    textLength,
                    text
                } = walkNode(node, new_query);
                switch (type) {
                    case TYPE_INLINE: // anything other than inline text returns empty text
                        const newAcc = accSectionTextLength + textLength;
                        return [Math.max(maxSectionTextLength, newAcc), newAcc, accText + text];
                    case TYPE_OFF_FLOW:
                        return [maxSectionTextLength, accSectionTextLength, accText];
                    case TYPE_FULL_WIDTH: // truncate text flow
                        return [maxSectionTextLength, 0, accText];
                }
            }, [0, 0, '']
        );

        if (maxSectionTextLength > MIN_TBLOCK_LENGTH && TBLOCK_RE.exec(text)) {
            queries = dominatedAdd(queries, new_query);
        }
        if (s.position.match(/absolute|fixed/) || s.float.match(/left|right/)) {
            // Resizable but off-flow element node
            debugNode(node, 'off-flow');
            return {
                type: TYPE_OFF_FLOW,
                textLength: 0,
                text: ''
            };
        } else {
            // Resizeable full-width element node
            debugNode(node, 'full-width');
            return {
                type: TYPE_FULL_WIDTH,
                textLength: 0,
                text: ''
            };
        }
    };

    let update = () => {
        // First pass
        queries.forEach((q, i) => each(safeQuerySelectorAll(q), node => {
            const fontSize = parseInt(window.getComputedStyle(node).fontSize),
                width = node.offsetWidth;
            node.__rfs_goalWidth = width > fontSize * MAX_LINE_WIDTH ? fontSize * OPT_LINE_WIDTH : 0;
            node.__rfs_goalFontSize = fontSize;
        }));

        // Second pass
        document.body.style.display = 'none';
        queries.forEach((q, i) => each(safeQuerySelectorAll(q), n => {
            n.style.hypens = 'auto';
            n.style.textAlign = 'justify';
            n.style.lineHeight = n.__rfs_goalFontSize * OPT_LINE_HEIGHT * (nonEng ? 1.125 : 1) + 'px';
            if (n.__rfs_goalWidth > 0) {
                n.style.width = n.__rfs_goalWidth + 'px';
            }
        }));
        document.body.style.display = '';
    };

    let saveAndUpdate = () => {
        var html = document.querySelector('html');
        var text = html.innerText;
        nonEng = text.replace(/\w/g, '').length / text.length > 0.5;
        walkNode(html);
        console.log(reduce(queries, (s, q, i) => s + '\n' + (i + 1) + ': ' + q, 'Readable Font Size\n'));
        queries.forEach(q => each(safeQuerySelectorAll(q), n => {
            n.__rfs_hypens = n.style.hyphens;
            n.__rfs_lineHeight = n.style.lineHeight;
            n.__rfs_textAlign = n.style.textAlign;
            n.__rfs_width = n.style.width;
        }));
        // window.addEventListener('resize', update);
        update();
        displayStatus('loaded');
    };

    let restore = () => {
        // window.removeEventListener('resize', update);
        queries.forEach(q => each(safeQuerySelectorAll(q), n => {
            n.style.hyphens = n.__rfs_hypens;
            n.style.lineHeight = n.__rfs_lineHeight;
            n.style.textAlign = n.__rfs_textAlign;
            n.style.width = n.__rfs_width;
        }));
        queries = [];
        displayStatus('none');
    };

    window.addEventListener('keypress', function(e) {
        if (e.which === 402) { // alt + f
            if (queries.length === 0) {
                saveAndUpdate();
            } else {
                restore();
            }
        }
    });
}
