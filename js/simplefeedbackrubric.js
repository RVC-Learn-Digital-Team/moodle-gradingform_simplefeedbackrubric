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
    var COURSEWORK_EDITOR_ID = 'feedback_comment';
    var COURSEWORK_EDITOR_NAME = 'feedbackcomment[text]';
    var WAIT_INTERVAL_MS = 250;
    var WAIT_TIMEOUT_MS = 30000;
    var pendingFeedback = new WeakMap();

    /**
     * Find the feedback textarea in the rubric's grading form.
     *
     * @param {HTMLFormElement} form
     * @param {Object} options init options from PHP
     * @return {HTMLTextAreaElement|null}
     */
    NS.findEditorTextarea = function(form, options) {
        var id = options.editorid || DEFAULT_EDITOR_ID;
        // Forms can be rendered with a suffixed id (e.g. in the grader app); find it by name.
        return form.querySelector('textarea#' + CSS.escape(id)) ||
            form.querySelector('textarea#' + COURSEWORK_EDITOR_ID) ||
            form.querySelector('textarea[id][name="' + DEFAULT_EDITOR_NAME + '"], ' +
                'textarea[id][name="' + COURSEWORK_EDITOR_NAME + '"]');
    };

    /**
     * True if a TinyMCE editor is initialised and still attached to the page.
     *
     * In the assignment grader, moving to the next student replaces the grading panel:
     * the old TinyMCE editor is destroyed and a new one is created with the same id.
     * For a moment tinymce.get(id) can still return the old, detached editor.
     *
     * @param {Object} ed TinyMCE editor
     * @param {HTMLTextAreaElement} textarea source of the current feedback editor
     * @return {Boolean}
     */
    NS.isLiveTinyEditor = function(ed, textarea) {
        if (!ed || !ed.initialized || ed.removed || ed.destroyed || ed.getElement() !== textarea) {
            return false;
        }
        var container = ed.getContainer();
        return !!(ed.getBody() && container && container.isConnected && textarea.isConnected);
    };

    /**
     * Return an editor adapter for the feedback editor if it is ready, otherwise null.
     *
     * @param {HTMLTextAreaElement|null} textarea
     * @param {HTMLFormElement} form
     * @return {Object|null}
     */
    NS.getEditorNow = function(textarea, form) {
        if (!textarea || !textarea.id || textarea.disabled || textarea.readOnly) {
            return null;
        }
        // TinyMCE.
        var tiny = window.tinymce || window.tinyMCE;
        if (tiny && typeof tiny.get === 'function') {
            var ed = tiny.get(textarea.id);
            if (NS.isLiveTinyEditor(ed, textarea)) {
                return NS.tinyAdapter(ed);
            }
        }
        // Atto.
        var editable = form.querySelector('.editor_atto_content#' + CSS.escape(textarea.id + 'editable'));
        if (editable) {
            return NS.attoAdapter(editable);
        }
        return null;
    };

    /**
     * Apply the latest feedback choice for a criterion when its editor is ready.
     *
     * @param {HTMLElement} criterion criterion row
     * @param {HTMLFormElement} form grading form at the time of the click
     * @param {Object} options
     * @param {Function} callback receives the editor adapter
     */
    NS.whenEditorReady = function(criterion, form, options, callback) {
        var started = Date.now();
        var check = function() {
            if (pendingFeedback.get(criterion) !== check) {
                return;
            }
            if (!criterion.isConnected || criterion.closest('form') !== form) {
                pendingFeedback.delete(criterion);
                return;
            }
            var editor = NS.getEditorNow(NS.findEditorTextarea(form, options), form);
            if (editor) {
                pendingFeedback.delete(criterion);
                callback(editor);
                return;
            }
            if (Date.now() - started > WAIT_TIMEOUT_MS) {
                pendingFeedback.delete(criterion);
                if (window.console) {
                    window.console.warn('gradingform_simplefeedbackrubric: feedback editor not found, ' +
                        'comments will not be auto-populated.');
                }
                return;
            }
            window.setTimeout(check, WAIT_INTERVAL_MS);
        };
        pendingFeedback.set(criterion, check);
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
                var done = false;
                if (ed.undoManager && typeof ed.undoManager.transact === 'function') {
                    try {
                        ed.undoManager.transact(function() {
                            run();
                            done = true;
                        });
                    } catch (ex) {
                        // Undo bookkeeping failed (e.g. no selection yet); still make the change.
                        if (window.console) {
                            window.console.warn('gradingform_simplefeedbackrubric: undo transaction failed', ex);
                        }
                    }
                }
                if (!done) {
                    run();
                    if (ed.undoManager && typeof ed.undoManager.add === 'function') {
                        try {
                            ed.undoManager.add();
                        } catch (ex) {
                            // Ignore: the content change itself has been made.
                        }
                    }
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
            NS.levelclick(e, options);
        }, selector + ' .level');
    };

    /**
     * Click on a level.
     *
     * @param {Object} e YUI event
     * @param {Object} options
     */
    NS.levelclick = function(e, options) {
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
        var node = el.getDOMNode();
        var form = node.closest('form');
        var criterion = node.closest('.criterion');
        if (!form || !criterion) {
            return;
        }

        var matches = (el.get('id') || '').match(/-criteria-(.+?)-levels-(\d+)$/);
        if (!matches) {
            return;
        }
        var criterionid = matches[1];
        var text = deselecting ? null : NS.getLevelText(node);

        NS.whenEditorReady(criterion, form, options, function(editor) {
            var x = window.scrollX, y = window.scrollY;
            NS.updateCriterionText(editor, options, criterionid, text);
            window.scrollTo(x, y);
        });
    };
})(M.gradingform_simplefeedbackrubric);
