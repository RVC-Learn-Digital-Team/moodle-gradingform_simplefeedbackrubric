/**
 * Grading-screen behaviour for the Simple Feedback Rubric.
 *
 * Handles level selection and, when "auto-populate comments" is on, writes the
 * selected level's text into the feedback comments editor.
 *
 * Supported editors:
 *  - TinyMCE (Moodle 4.5+): driven through the TinyMCE API (undo, dirty flag, change event).
 *  - Atto (Moodle 4.5 only): edits Atto's contenteditable area, which Atto copies back
 *    to the textarea when the form is submitted.
 *
 * Each criterion's text is held in a block marked with data-sfr-criterion="<criterionid>".
 * Feedback written by older versions used <span name="comment-criteria-<criterionid>">; those
 * markers are still recognised and are replaced with the new format when edited.
 *
 * @package    gradingform_simplefeedbackrubric
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

M.gradingform_simplefeedbackrubric = M.gradingform_simplefeedbackrubric || {};

(function(NS) {
    var MARKER_ATTR = 'data-sfr-criterion';
    var LEGACY_NAME_PREFIX = 'comment-criteria-';
    var DEFAULT_EDITOR_ID = 'id_assignfeedbackcomments_editor';
    var DEFAULT_EDITOR_NAME = 'assignfeedbackcomments_editor[text]';
    var WAIT_INTERVAL_MS = 250;
    var WAIT_TIMEOUT_MS = 30000;

    /**
     * Work out the id of the feedback textarea.
     *
     * @param {Object} options init options from PHP
     * @return {String|null}
     */
    NS.findEditorTextareaId = function(options) {
        var id = (options && options.editorid) || DEFAULT_EDITOR_ID;
        if (document.getElementById(id)) {
            return id;
        }
        // Forms can be rendered with a suffixed id (e.g. in the grader app); find it by name.
        var byname = document.querySelector('textarea[name="' + DEFAULT_EDITOR_NAME + '"]');
        if (byname && byname.id) {
            return byname.id;
        }
        return null;
    };

    /**
     * Return an editor adapter for the feedback editor if it is ready, otherwise null.
     *
     * @param {String} textareaid
     * @return {Object|null}
     */
    NS.getEditorNow = function(textareaid) {
        if (!textareaid) {
            return null;
        }
        // TinyMCE.
        var tiny = window.tinymce || window.tinyMCE;
        if (tiny && typeof tiny.get === 'function') {
            var ed = tiny.get(textareaid);
            if (ed && ed.initialized && ed.getBody()) {
                return NS.tinyAdapter(ed);
            }
        }
        // Atto.
        var editable = document.getElementById(textareaid + 'editable');
        if (editable && editable.classList.contains('editor_atto_content')) {
            return NS.attoAdapter(editable);
        }
        return null;
    };

    /**
     * Call back with the editor adapter once the editor has finished loading.
     * TinyMCE loads asynchronously, after this script's init has run, so we poll briefly.
     *
     * @param {Object} options
     * @param {Function} callback receives the adapter (or null on timeout)
     */
    NS.whenEditorReady = function(options, callback) {
        var started = Date.now();
        var check = function() {
            var textareaid = NS.findEditorTextareaId(options);
            var editor = NS.getEditorNow(textareaid);
            if (editor) {
                callback(editor);
                return;
            }
            // A TinyMCE instance that exists but has not finished initialising.
            var tiny = window.tinymce || window.tinyMCE;
            var pending = textareaid && tiny && typeof tiny.get === 'function' ? tiny.get(textareaid) : null;
            if (pending && !pending.initialized && typeof pending.on === 'function') {
                pending.on('init', function() {
                    callback(NS.tinyAdapter(pending));
                });
                return;
            }
            if (Date.now() - started > WAIT_TIMEOUT_MS) {
                if (window.console) {
                    window.console.warn('gradingform_simplefeedbackrubric: feedback editor not found, ' +
                        'comments will not be auto-populated.');
                }
                callback(null);
                return;
            }
            window.setTimeout(check, WAIT_INTERVAL_MS);
        };
        check();
    };

    /**
     * Adapter for TinyMCE.
     *
     * @param {Object} ed TinyMCE editor
     * @return {Object}
     */
    NS.tinyAdapter = function(ed) {
        return {
            type: 'tinymce',
            getBody: function() {
                return ed.getBody();
            },
            change: function(fn) {
                var run = function() {
                    fn(ed.getBody());
                };
                if (ed.undoManager && typeof ed.undoManager.transact === 'function') {
                    ed.undoManager.transact(run);
                } else {
                    run();
                }
                ed.setDirty(true);
                if (typeof ed.dispatch === 'function') {
                    ed.dispatch('change');
                } else if (typeof ed.fire === 'function') {
                    ed.fire('change');
                }
                ed.save();
            }
        };
    };

    /**
     * Adapter for Atto.
     *
     * @param {HTMLElement} editable Atto's contenteditable div
     * @return {Object}
     */
    NS.attoAdapter = function(editable) {
        return {
            type: 'atto',
            getBody: function() {
                return editable;
            },
            change: function(fn) {
                fn(editable);
                // Let Atto (and the form change checker) know the content changed.
                editable.dispatchEvent(new Event('input', {bubbles: true}));
            }
        };
    };

    /**
     * Find the existing block for a criterion (new or legacy marker).
     *
     * @param {HTMLElement} body
     * @param {String} criterionid
     * @return {HTMLElement|null}
     */
    NS.findMarker = function(body, criterionid) {
        return body.querySelector('[' + MARKER_ATTR + '="' + criterionid + '"]') ||
            body.querySelector('span[name="' + LEGACY_NAME_PREFIX + criterionid + '"]');
    };

    /**
     * Build the block holding a level's text.
     *
     * @param {Document} doc the editor's document
     * @param {String} criterionid
     * @param {String} text plain text, newlines become line breaks
     * @return {HTMLElement}
     */
    NS.buildMarker = function(doc, criterionid, text) {
        var p = doc.createElement('p');
        p.setAttribute(MARKER_ATTR, criterionid);
        var lines = text.split(/\r?\n/);
        for (var i = 0; i < lines.length; i++) {
            if (i > 0) {
                p.appendChild(doc.createElement('br'));
            }
            p.appendChild(doc.createTextNode(lines[i]));
        }
        return p;
    };

    /**
     * True if the editor holds nothing but empty paragraphs / line breaks.
     *
     * @param {HTMLElement} body
     * @return {Boolean}
     */
    NS.isEmpty = function(body) {
        return body.textContent.replace(/ /g, ' ').trim() === '' &&
            !body.querySelector('img, video, audio, iframe, object, table, [' + MARKER_ATTR + ']');
    };

    /**
     * Put a level's text into the editor for one criterion, or remove it.
     *
     * @param {Object} editor adapter
     * @param {Object} options init options
     * @param {String} criterionid
     * @param {String|null} text null removes the criterion's text
     */
    NS.updateCriterionText = function(editor, options, criterionid, text) {
        editor.change(function(body) {
            var doc = body.ownerDocument;
            var existing = NS.findMarker(body, criterionid);

            if (text === null) {
                if (existing) {
                    existing.parentNode.removeChild(existing);
                }
                return;
            }

            var block = NS.buildMarker(doc, criterionid, text);
            if (existing) {
                existing.parentNode.replaceChild(block, existing);
                return;
            }

            // Clear the editor's empty placeholder paragraph, if that's all there is.
            if (NS.isEmpty(body)) {
                while (body.firstChild) {
                    body.removeChild(body.firstChild);
                }
            }

            // Keep criteria in rubric order, if that option is on.
            if (options.criterionordering && options.criterion) {
                var order = options.criterion.map(String);
                var pos = order.indexOf(String(criterionid));
                for (var i = pos + 1; pos >= 0 && i < order.length; i++) {
                    var next = NS.findMarker(body, order[i]);
                    if (next) {
                        next.parentNode.insertBefore(block, next);
                        return;
                    }
                }
            }
            body.appendChild(block);
        });
    };

    /**
     * Plain text of a level's definition.
     *
     * @param {HTMLElement} levelnode the .level table cell
     * @return {String}
     */
    NS.getLevelText = function(levelnode) {
        var def = levelnode.querySelector('.definition');
        var text = def ? (def.innerText || def.textContent) : (levelnode.innerText || levelnode.textContent);
        return text.trim();
    };

    /**
     * Called for each simplefeedbackrubric on the page.
     *
     * @param {Object} Y YUI instance
     * @param {Object} options
     */
    NS.init = function(Y, options) {
        var state = {editor: null};
        var selector = '#simplefeedbackrubric-' + options.name;

        // Level selection always works, whether or not an editor is found.
        Y.all(selector + ' .radio').setStyle('display', 'none');
        Y.all(selector + ' .level').each(function(node) {
            var radio = node.one('input[type=radio]');
            if (radio && radio.get('checked')) {
                node.addClass('checked');
            }
        });
        Y.on('click', function(e) {
            NS.levelclick(e, Y, options, state);
        }, selector + ' .level');

        if (options.autopopulatecomments) {
            NS.whenEditorReady(options, function(editor) {
                state.editor = editor;
            });
        }
    };

    /**
     * Click on a level.
     *
     * @param {Object} e YUI event
     * @param {Object} Y YUI instance
     * @param {Object} options
     * @param {Object} state
     */
    NS.levelclick = function(e, Y, options, state) {
        var el = e.currentTarget;
        if (!el || !el.hasClass('level')) {
            el = e.target;
            while (el && !el.hasClass('level')) {
                el = el.get('parentNode');
            }
        }
        if (!el) {
            return;
        }
        e.preventDefault();

        var radio = el.one('input[type=radio]');
        var deselecting = radio && radio.get('checked');

        // Update the selection.
        el.siblings().removeClass('checked');
        if (!deselecting) {
            if (radio) {
                radio.set('checked', true);
            }
            el.addClass('checked');
        } else {
            el.removeClass('checked');
            el.get('parentNode').all('input[type=radio]').set('checked', false);
        }

        if (!options.autopopulatecomments) {
            return;
        }
        var editor = state.editor || NS.getEditorNow(NS.findEditorTextareaId(options));
        if (!editor) {
            return;
        }
        state.editor = editor;

        var matches = (el.get('id') || '').match(/-criteria-(.+?)-levels-(\d+)$/);
        if (!matches) {
            return;
        }
        var criterionid = matches[1];
        var text = deselecting ? null : NS.getLevelText(el.getDOMNode());

        var x = window.scrollX, y = window.scrollY;
        NS.updateCriterionText(editor, options, criterionid, text);
        window.scrollTo(x, y);
    };
})(M.gradingform_simplefeedbackrubric);
