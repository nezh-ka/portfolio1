/**
* jquery.matchHeight.js master
* http://brm.io/jquery-match-height/
* License: MIT
*/

;(function(factory) { // eslint-disable-line no-extra-semi
    'use strict';
    if (typeof define === 'function' && define.amd) {
        // AMD
        define(['jquery'], factory);
    } else if (typeof module !== 'undefined' && module.exports) {
        // CommonJS
        module.exports = factory(require('jquery'));
    } else {
        // Global
        factory(jQuery);
    }
})(function($) {
    /*
    *  internal
    */

    var _previousResizeWidth = -1,
        _updateTimeout = -1;

    /*
    *  _parse
    *  value parse utility function
    */

    var _parse = function(value) {
        // parse value and convert NaN to 0
        return parseFloat(value) || 0;
    };

    /*
    *  _rows
    *  utility function returns array of jQuery selections representing each row
    *  (as displayed after float wrapping applied by browser)
    */

    var _rows = function(elements) {
        var tolerance = 1,
            $elements = $(elements),
            lastTop = null,
            rows = [];

        // group elements by their top position
        $elements.each(function(){
            var $that = $(this),
                top = $that.offset().top - _parse($that.css('margin-top')),
                lastRow = rows.length > 0 ? rows[rows.length - 1] : null;

            if (lastRow === null) {
                // first item on the row, so just push it
                rows.push($that);
            } else {
                // if the row top is the same, add to the row group
                if (Math.floor(Math.abs(lastTop - top)) <= tolerance) {
                    rows[rows.length - 1] = lastRow.add($that);
                } else {
                    // otherwise start a new row group
                    rows.push($that);
                }
            }

            // keep track of the last row top
            lastTop = top;
        });

        return rows;
    };

    /*
    *  _parseOptions
    *  handle plugin options
    */

    var _parseOptions = function(options) {
        var opts = {
            byRow: true,
            property: 'height',
            target: null,
            remove: false
        };

        if (typeof options === 'object') {
            return $.extend(opts, options);
        }

        if (typeof options === 'boolean') {
            opts.byRow = options;
        } else if (options === 'remove') {
            opts.remove = true;
        }

        return opts;
    };

    /*
    *  matchHeight
    *  plugin definition
    */

    var matchHeight = $.fn.matchHeight = function(options) {
        var opts = _parseOptions(options);

        // handle remove
        if (opts.remove) {
            var that = this;

            // remove fixed height from all selected elements
            this.css(opts.property, '');

            // remove selected elements from all groups
            $.each(matchHeight._groups, function(key, group) {
                group.elements = group.elements.not(that);
            });

            // TODO: cleanup empty groups

            return this;
        }

        if (this.length <= 1 && !opts.target) {
            return this;
        }

        // keep track of this group so we can re-apply later on load and resize events
        matchHeight._groups.push({
            elements: this,
            options: opts
        });

        // match each element's height to the tallest element in the selection
        matchHeight._apply(this, opts);

        return this;
    };

    /*
    *  plugin global options
    */

    matchHeight.version = 'master';
    matchHeight._groups = [];
    matchHeight._throttle = 80;
    matchHeight._maintainScroll = false;
    matchHeight._beforeUpdate = null;
    matchHeight._afterUpdate = null;
    matchHeight._rows = _rows;
    matchHeight._parse = _parse;
    matchHeight._parseOptions = _parseOptions;

    /*
    *  matchHeight._apply
    *  apply matchHeight to given elements
    */

    matchHeight._apply = function(elements, options) {
        var opts = _parseOptions(options),
            $elements = $(elements),
            rows = [$elements];

        // take note of scroll position
        var scrollTop = $(window).scrollTop(),
            htmlHeight = $('html').outerHeight(true);

        // get hidden parents
        var $hiddenParents = $elements.parents().filter(':hidden');

        // cache the original inline style
        $hiddenParents.each(function() {
            var $that = $(this);
            $that.data('style-cache', $that.attr('style'));
        });

        // temporarily must force hidden parents visible
        $hiddenParents.css('display', 'block');

        // get rows if using byRow, otherwise assume one row
        if (opts.byRow && !opts.target) {

            // must first force an arbitrary equal height so floating elements break evenly
            $elements.each(function() {
                var $that = $(this),
                    display = $that.css('display');

                // temporarily force a usable display value
                if (display !== 'inline-block' && display !== 'flex' && display !== 'inline-flex') {
                    display = 'block';
                }

                // cache the original inline style
                $that.data('style-cache', $that.attr('style'));

                $that.css({
                    'display': display,
                    'padding-top': '0',
                    'padding-bottom': '0',
                    'margin-top': '0',
                    'margin-bottom': '0',
                    'border-top-width': '0',
                    'border-bottom-width': '0',
                    'height': '100px',
                    'overflow': 'hidden'
                });
            });

            // get the array of rows (based on element top position)
            rows = _rows($elements);

            // revert original inline styles
            $elements.each(function() {
                var $that = $(this);
                $that.attr('style', $that.data('style-cache') || '');
            });
        }

        $.each(rows, function(key, row) {
            var $row = $(row),
                targetHeight = 0;

            if (!opts.target) {
                // skip apply to rows with only one item
                if (opts.byRow && $row.length <= 1) {
                    $row.css(opts.property, '');
                    return;
                }

                // iterate the row and find the max height
                $row.each(function(){
                    var $that = $(this),
                        display = $that.css('display');

                    // temporarily force a usable display value
                    if (display !== 'inline-block' && display !== 'flex' && display !== 'inline-flex') {
                        display = 'block';
                    }

                    // ensure we get the correct actual height (and not a previously set height value)
                    var css = { 'display': display };
                    css[opts.property] = '';
                    $that.css(css);

                    // find the max height (including padding, but not margin)
                    if ($that.outerHeight(false) > targetHeight) {
                        targetHeight = $that.outerHeight(false);
                    }

                    // revert display block
                    $that.css('display', '');
                });
            } else {
                // if target set, use the height of the target element
                targetHeight = opts.target.outerHeight(false);
            }

            // iterate the row and apply the height to all elements
            $row.each(function(){
                var $that = $(this),
                    verticalPadding = 0;

                // don't apply to a target
                if (opts.target && $that.is(opts.target)) {
                    return;
                }

                // handle padding and border correctly (required when not using border-box)
                if ($that.css('box-sizing') !== 'border-box') {
                    verticalPadding += _parse($that.css('border-top-width')) + _parse($that.css('border-bottom-width'));
                    verticalPadding += _parse($that.css('padding-top')) + _parse($that.css('padding-bottom'));
                }

                // set the height (accounting for padding and border)
                $that.css(opts.property, (targetHeight - verticalPadding) + 'px');
            });
        });

        // revert hidden parents
        $hiddenParents.each(function() {
            var $that = $(this);
            $that.attr('style', $that.data('style-cache') || null);
        });

        // restore scroll position if enabled
        if (matchHeight._maintainScroll) {
            $(window).scrollTop((scrollTop / htmlHeight) * $('html').outerHeight(true));
        }

        return this;
    };

    /*
    *  matchHeight._applyDataApi
    *  applies matchHeight to all elements with a data-match-height attribute
    */

    matchHeight._applyDataApi = function() {
        var groups = {};

        // generate groups by their groupId set by elements using data-match-height
        $('[data-match-height], [data-mh]').each(function() {
            var $this = $(this),
                groupId = $this.attr('data-mh') || $this.attr('data-match-height');

            if (groupId in groups) {
                groups[groupId] = groups[groupId].add($this);
            } else {
                groups[groupId] = $this;
            }
        });

        // apply matchHeight to each group
        $.each(groups, function() {
            this.matchHeight(true);
        });
    };

    /*
    *  matchHeight._update
    *  updates matchHeight on all current groups with their correct options
    */

    var _update = function(event) {
        if (matchHeight._beforeUpdate) {
            matchHeight._beforeUpdate(event, matchHeight._groups);
        }

        $.each(matchHeight._groups, function() {
            matchHeight._apply(this.elements, this.options);
        });

        if (matchHeight._afterUpdate) {
            matchHeight._afterUpdate(event, matchHeight._groups);
        }
    };

    matchHeight._update = function(throttle, event) {
        // prevent update if fired from a resize event
        // where the viewport width hasn't actually changed
        // fixes an event looping bug in IE8
        if (event && event.type === 'resize') {
            var windowWidth = $(window).width();
            if (windowWidth === _previousResizeWidth) {
                return;
            }
            _previousResizeWidth = windowWidth;
        }

        // throttle updates
        if (!throttle) {
            _update(event);
        } else if (_updateTimeout === -1) {
            _updateTimeout = setTimeout(function() {
                _update(event);
                _updateTimeout = -1;
            }, matchHeight._throttle);
        }
    };

    /*
    *  bind events
    */

    // apply on DOM ready event
    $(matchHeight._applyDataApi);

    // update heights on load and resize events
    $(window).bind('load', function(event) {
        matchHeight._update(false, event);
    });

    // throttled update heights on resize events
    $(window).bind('resize orientationchange', function(event) {
        matchHeight._update(true, event);
    });

});


// Generated by CoffeeScript 1.6.2
/*!
jQuery Waypoints - v2.0.5
Copyright (c) 2011-2014 Caleb Troughton
Licensed under the MIT license.
https://github.com/imakewebthings/jquery-waypoints/blob/master/licenses.txt
*/


(function() {
    var __indexOf = [].indexOf || function(item) { for (var i = 0, l = this.length; i < l; i++) { if (i in this && this[i] === item) return i; } return -1; },
      __slice = [].slice;
  
    (function(root, factory) {
      if (typeof define === 'function' && define.amd) {
        return define('waypoints', ['jquery'], function($) {
          return factory($, root);
        });
      } else {
        return factory(root.jQuery, root);
      }
    })(window, function($, window) {
      var $w, Context, Waypoint, allWaypoints, contextCounter, contextKey, contexts, isTouch, jQMethods, methods, resizeEvent, scrollEvent, waypointCounter, waypointKey, wp, wps;
  
      $w = $(window);
      isTouch = __indexOf.call(window, 'ontouchstart') >= 0;
      allWaypoints = {
        horizontal: {},
        vertical: {}
      };
      contextCounter = 1;
      contexts = {};
      contextKey = 'waypoints-context-id';
      resizeEvent = 'resize.waypoints';
      scrollEvent = 'scroll.waypoints';
      waypointCounter = 1;
      waypointKey = 'waypoints-waypoint-ids';
      wp = 'waypoint';
      wps = 'waypoints';
      Context = (function() {
        function Context($element) {
          var _this = this;
  
          this.$element = $element;
          this.element = $element[0];
          this.didResize = false;
          this.didScroll = false;
          this.id = 'context' + contextCounter++;
          this.oldScroll = {
            x: $element.scrollLeft(),
            y: $element.scrollTop()
          };
          this.waypoints = {
            horizontal: {},
            vertical: {}
          };
          this.element[contextKey] = this.id;
          contexts[this.id] = this;
          $element.bind(scrollEvent, function() {
            var scrollHandler;
  
            if (!(_this.didScroll || isTouch)) {
              _this.didScroll = true;
              scrollHandler = function() {
                _this.doScroll();
                return _this.didScroll = false;
              };
              return window.setTimeout(scrollHandler, $[wps].settings.scrollThrottle);
            }
          });
          $element.bind(resizeEvent, function() {
            var resizeHandler;
  
            if (!_this.didResize) {
              _this.didResize = true;
              resizeHandler = function() {
                $[wps]('refresh');
                return _this.didResize = false;
              };
              return window.setTimeout(resizeHandler, $[wps].settings.resizeThrottle);
            }
          });
        }
  
        Context.prototype.doScroll = function() {
          var axes,
            _this = this;
  
          axes = {
            horizontal: {
              newScroll: this.$element.scrollLeft(),
              oldScroll: this.oldScroll.x,
              forward: 'right',
              backward: 'left'
            },
            vertical: {
              newScroll: this.$element.scrollTop(),
              oldScroll: this.oldScroll.y,
              forward: 'down',
              backward: 'up'
            }
          };
          if (isTouch && (!axes.vertical.oldScroll || !axes.vertical.newScroll)) {
            $[wps]('refresh');
          }
          $.each(axes, function(aKey, axis) {
            var direction, isForward, triggered;
  
            triggered = [];
            isForward = axis.newScroll > axis.oldScroll;
            direction = isForward ? axis.forward : axis.backward;
            $.each(_this.waypoints[aKey], function(wKey, waypoint) {
              var _ref, _ref1;
  
              if ((axis.oldScroll < (_ref = waypoint.offset) && _ref <= axis.newScroll)) {
                return triggered.push(waypoint);
              } else if ((axis.newScroll < (_ref1 = waypoint.offset) && _ref1 <= axis.oldScroll)) {
                return triggered.push(waypoint);
              }
            });
            triggered.sort(function(a, b) {
              return a.offset - b.offset;
            });
            if (!isForward) {
              triggered.reverse();
            }
            return $.each(triggered, function(i, waypoint) {
              if (waypoint.options.continuous || i === triggered.length - 1) {
                return waypoint.trigger([direction]);
              }
            });
          });
          return this.oldScroll = {
            x: axes.horizontal.newScroll,
            y: axes.vertical.newScroll
          };
        };
  
        Context.prototype.refresh = function() {
          var axes, cOffset, isWin,
            _this = this;
  
          isWin = $.isWindow(this.element);
          cOffset = this.$element.offset();
          this.doScroll();
          axes = {
            horizontal: {
              contextOffset: isWin ? 0 : cOffset.left,
              contextScroll: isWin ? 0 : this.oldScroll.x,
              contextDimension: this.$element.width(),
              oldScroll: this.oldScroll.x,
              forward: 'right',
              backward: 'left',
              offsetProp: 'left'
            },
            vertical: {
              contextOffset: isWin ? 0 : cOffset.top,
              contextScroll: isWin ? 0 : this.oldScroll.y,
              contextDimension: isWin ? $[wps]('viewportHeight') : this.$element.height(),
              oldScroll: this.oldScroll.y,
              forward: 'down',
              backward: 'up',
              offsetProp: 'top'
            }
          };
          return $.each(axes, function(aKey, axis) {
            return $.each(_this.waypoints[aKey], function(i, waypoint) {
              var adjustment, elementOffset, oldOffset, _ref, _ref1;
  
              adjustment = waypoint.options.offset;
              oldOffset = waypoint.offset;
              elementOffset = $.isWindow(waypoint.element) ? 0 : waypoint.$element.offset()[axis.offsetProp];
              if ($.isFunction(adjustment)) {
                adjustment = adjustment.apply(waypoint.element);
              } else if (typeof adjustment === 'string') {
                adjustment = parseFloat(adjustment);
                if (waypoint.options.offset.indexOf('%') > -1) {
                  adjustment = Math.ceil(axis.contextDimension * adjustment / 100);
                }
              }
              waypoint.offset = elementOffset - axis.contextOffset + axis.contextScroll - adjustment;
              if ((waypoint.options.onlyOnScroll && (oldOffset != null)) || !waypoint.enabled) {
                return;
              }
              if (oldOffset !== null && (oldOffset < (_ref = axis.oldScroll) && _ref <= waypoint.offset)) {
                return waypoint.trigger([axis.backward]);
              } else if (oldOffset !== null && (oldOffset > (_ref1 = axis.oldScroll) && _ref1 >= waypoint.offset)) {
                return waypoint.trigger([axis.forward]);
              } else if (oldOffset === null && axis.oldScroll >= waypoint.offset) {
                return waypoint.trigger([axis.forward]);
              }
            });
          });
        };
  
        Context.prototype.checkEmpty = function() {
          if ($.isEmptyObject(this.waypoints.horizontal) && $.isEmptyObject(this.waypoints.vertical)) {
            this.$element.unbind([resizeEvent, scrollEvent].join(' '));
            return delete contexts[this.id];
          }
        };
  
        return Context;
  
      })();
      Waypoint = (function() {
        function Waypoint($element, context, options) {
          var idList, _ref;
  
          if (options.offset === 'bottom-in-view') {
            options.offset = function() {
              var contextHeight;
  
              contextHeight = $[wps]('viewportHeight');
              if (!$.isWindow(context.element)) {
                contextHeight = context.$element.height();
              }
              return contextHeight - $(this).outerHeight();
            };
          }
          this.$element = $element;
          this.element = $element[0];
          this.axis = options.horizontal ? 'horizontal' : 'vertical';
          this.callback = options.handler;
          this.context = context;
          this.enabled = options.enabled;
          this.id = 'waypoints' + waypointCounter++;
          this.offset = null;
          this.options = options;
          context.waypoints[this.axis][this.id] = this;
          allWaypoints[this.axis][this.id] = this;
          idList = (_ref = this.element[waypointKey]) != null ? _ref : [];
          idList.push(this.id);
          this.element[waypointKey] = idList;
        }
  
        Waypoint.prototype.trigger = function(args) {
          if (!this.enabled) {
            return;
          }
          if (this.callback != null) {
            this.callback.apply(this.element, args);
          }
          if (this.options.triggerOnce) {
            return this.destroy();
          }
        };
  
        Waypoint.prototype.disable = function() {
          return this.enabled = false;
        };
  
        Waypoint.prototype.enable = function() {
          this.context.refresh();
          return this.enabled = true;
        };
  
        Waypoint.prototype.destroy = function() {
          delete allWaypoints[this.axis][this.id];
          delete this.context.waypoints[this.axis][this.id];
          return this.context.checkEmpty();
        };
  
        Waypoint.getWaypointsByElement = function(element) {
          var all, ids;
  
          ids = element[waypointKey];
          if (!ids) {
            return [];
          }
          all = $.extend({}, allWaypoints.horizontal, allWaypoints.vertical);
          return $.map(ids, function(id) {
            return all[id];
          });
        };
  
        return Waypoint;
  
      })();
      methods = {
        init: function(f, options) {
          var _ref;
  
          options = $.extend({}, $.fn[wp].defaults, options);
          if ((_ref = options.handler) == null) {
            options.handler = f;
          }
          this.each(function() {
            var $this, context, contextElement, _ref1;
  
            $this = $(this);
            contextElement = (_ref1 = options.context) != null ? _ref1 : $.fn[wp].defaults.context;
            if (!$.isWindow(contextElement)) {
              contextElement = $this.closest(contextElement);
            }
            contextElement = $(contextElement);
            context = contexts[contextElement[0][contextKey]];
            if (!context) {
              context = new Context(contextElement);
            }
            return new Waypoint($this, context, options);
          });
          $[wps]('refresh');
          return this;
        },
        disable: function() {
          return methods._invoke.call(this, 'disable');
        },
        enable: function() {
          return methods._invoke.call(this, 'enable');
        },
        destroy: function() {
          return methods._invoke.call(this, 'destroy');
        },
        prev: function(axis, selector) {
          return methods._traverse.call(this, axis, selector, function(stack, index, waypoints) {
            if (index > 0) {
              return stack.push(waypoints[index - 1]);
            }
          });
        },
        next: function(axis, selector) {
          return methods._traverse.call(this, axis, selector, function(stack, index, waypoints) {
            if (index < waypoints.length - 1) {
              return stack.push(waypoints[index + 1]);
            }
          });
        },
        _traverse: function(axis, selector, push) {
          var stack, waypoints;
  
          if (axis == null) {
            axis = 'vertical';
          }
          if (selector == null) {
            selector = window;
          }
          waypoints = jQMethods.aggregate(selector);
          stack = [];
          this.each(function() {
            var index;
  
            index = $.inArray(this, waypoints[axis]);
            return push(stack, index, waypoints[axis]);
          });
          return this.pushStack(stack);
        },
        _invoke: function(method) {
          this.each(function() {
            var waypoints;
  
            waypoints = Waypoint.getWaypointsByElement(this);
            return $.each(waypoints, function(i, waypoint) {
              waypoint[method]();
              return true;
            });
          });
          return this;
        }
      };
      $.fn[wp] = function() {
        var args, method;
  
        method = arguments[0], args = 2 <= arguments.length ? __slice.call(arguments, 1) : [];
        if (methods[method]) {
          return methods[method].apply(this, args);
        } else if ($.isFunction(method)) {
          return methods.init.apply(this, arguments);
        } else if ($.isPlainObject(method)) {
          return methods.init.apply(this, [null, method]);
        } else if (!method) {
          return $.error("jQuery Waypoints needs a callback function or handler option.");
        } else {
          return $.error("The " + method + " method does not exist in jQuery Waypoints.");
        }
      };
      $.fn[wp].defaults = {
        context: window,
        continuous: true,
        enabled: true,
        horizontal: false,
        offset: 0,
        triggerOnce: false
      };
      jQMethods = {
        refresh: function() {
          return $.each(contexts, function(i, context) {
            return context.refresh();
          });
        },
        viewportHeight: function() {
          var _ref;
  
          return (_ref = window.innerHeight) != null ? _ref : $w.height();
        },
        aggregate: function(contextSelector) {
          var collection, waypoints, _ref;
  
          collection = allWaypoints;
          if (contextSelector) {
            collection = (_ref = contexts[$(contextSelector)[0][contextKey]]) != null ? _ref.waypoints : void 0;
          }
          if (!collection) {
            return [];
          }
          waypoints = {
            horizontal: [],
            vertical: []
          };
          $.each(waypoints, function(axis, arr) {
            $.each(collection[axis], function(key, waypoint) {
              return arr.push(waypoint);
            });
            arr.sort(function(a, b) {
              return a.offset - b.offset;
            });
            waypoints[axis] = $.map(arr, function(waypoint) {
              return waypoint.element;
            });
            return waypoints[axis] = $.unique(waypoints[axis]);
          });
          return waypoints;
        },
        above: function(contextSelector) {
          if (contextSelector == null) {
            contextSelector = window;
          }
          return jQMethods._filter(contextSelector, 'vertical', function(context, waypoint) {
            return waypoint.offset <= context.oldScroll.y;
          });
        },
        below: function(contextSelector) {
          if (contextSelector == null) {
            contextSelector = window;
          }
          return jQMethods._filter(contextSelector, 'vertical', function(context, waypoint) {
            return waypoint.offset > context.oldScroll.y;
          });
        },
        left: function(contextSelector) {
          if (contextSelector == null) {
            contextSelector = window;
          }
          return jQMethods._filter(contextSelector, 'horizontal', function(context, waypoint) {
            return waypoint.offset <= context.oldScroll.x;
          });
        },
        right: function(contextSelector) {
          if (contextSelector == null) {
            contextSelector = window;
          }
          return jQMethods._filter(contextSelector, 'horizontal', function(context, waypoint) {
            return waypoint.offset > context.oldScroll.x;
          });
        },
        enable: function() {
          return jQMethods._invoke('enable');
        },
        disable: function() {
          return jQMethods._invoke('disable');
        },
        destroy: function() {
          return jQMethods._invoke('destroy');
        },
        extendFn: function(methodName, f) {
          return methods[methodName] = f;
        },
        _invoke: function(method) {
          var waypoints;
  
          waypoints = $.extend({}, allWaypoints.vertical, allWaypoints.horizontal);
          return $.each(waypoints, function(key, waypoint) {
            waypoint[method]();
            return true;
          });
        },
        _filter: function(selector, axis, test) {
          var context, waypoints;
  
          context = contexts[$(selector)[0][contextKey]];
          if (!context) {
            return [];
          }
          waypoints = [];
          $.each(context.waypoints[axis], function(i, waypoint) {
            if (test(context, waypoint)) {
              return waypoints.push(waypoint);
            }
          });
          waypoints.sort(function(a, b) {
            return a.offset - b.offset;
          });
          return $.map(waypoints, function(waypoint) {
            return waypoint.element;
          });
        }
      };
      $[wps] = function() {
        var args, method;
  
        method = arguments[0], args = 2 <= arguments.length ? __slice.call(arguments, 1) : [];
        if (jQMethods[method]) {
          return jQMethods[method].apply(null, args);
        } else {
          return jQMethods.aggregate.call(null, method);
        }
      };
      $[wps].settings = {
        resizeThrottle: 100,
        scrollThrottle: 30
      };
      return $w.on('load.waypoints', function() {
        return $[wps]('refresh');
      });
    });
  
  }).call(this);