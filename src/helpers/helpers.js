/**
* Stache Helpers
* Bobby Earl, 2015-02-12
*
* NOTES
*   - Overriding default markdown / md helpers for one simple reason.
*   - Nesting HTML generated text with four spaces.  Marked thinks this is code.
*   - In order to fix this, I override the rule that supports four spaces as code.
*   - The GFM (```) for code still works.
**/

/*jslint node: true, nomen: true, plusplus: true */
'use strict';

module.exports.register = function (Handlebars, options, params) {

  var merge = require('merge');
  var cheerio = require('cheerio');
  var fs = require('fs');

  // This is such a hack just to handle nested markdown blocks.
  var marked = require('marked');
  var renderer = new marked.Renderer();
  var lexer = new marked.Lexer();
//  renderer.html = function(html) {
//    console.log(html);
//    return html;
//  };
  lexer.rules.code = /ANYTHING_BUT_FOUR_SPACES/;

  // Stores any custom counters
  var counts = {};

  /**
  * Utility function to get the basename
  **/
  function basename(path, clean) {

    // Clean is optional, but defaults to true
    if (arguments.length !== 2) {
      clean = true;
    }

    if (clean && path) {
      var dot = path.lastIndexOf('.')

      // Replace the extension
      path = dot === -1 ? path : path.substr(0, dot);

      // Replace the default page name
      path = path.replace('index', '');

      // Remove our build folder
      path = path.replace(params.assemble.options.stache.config.build, '');

      // Remove leading & trailing slash
      path = path.replace(/^\/|\/$/g, '');

    // Always return a path
    } else {
      path = '';
    }

    return path;
  }

  /**
  * Determines if two URI's are the same.
  * Supports thinking parent uri's are active
  **/
  function isActiveNav(dest, uri, parentCanBeActive) {
    dest = basename(dest);
    uri = basename(uri);
    var r = (parentCanBeActive && uri !== '') ? dest.indexOf(uri) > -1 : uri === dest;
    return r;
  }

  /**
  * Recursively searches the nav array to find the active link
  **/
  function getActiveNav(dest, nav_links, parentCanBeActive) {
    var j = nav_links.length,
      i = 0,
      r = '';

    for (i; i < j; i++) {

      if (isActiveNav(dest, nav_links[i].uri, parentCanBeActive)) {
        r = nav_links[i];
      } else if (nav_links[i].nav_links) {
        r = getActiveNav(dest, nav_links[i].nav_links, parentCanBeActive);
      }

      if (r !== '') {
        break;
      }
    }

    return r;
  }

  /**
  * Light wrapper for our custom markdown processor.
  **/
  function getMarked(md) {
    return marked.parser(lexer.lex(md || ''), {
      headerPrefix: '',
      renderer: renderer
    });
  }

  /**
  * http://stackoverflow.com/questions/10015027/javascript-tofixed-not-rounding
  **/
  function toFixed ( number, precision ) {
    var multiplier  = Math.pow( 10, precision + 1 ),
        wholeNumber = Math.round( number * multiplier ).toString(),
        length      = wholeNumber.length - 1;
    wholeNumber = wholeNumber.substr(0, length);
    return [
      wholeNumber.substr(0, length - precision),
      wholeNumber.substr(-precision)
    ].join('.');
  }

  Handlebars.registerHelper({

    /**
    * Get an operation from data.operations.
    * @param {string} [property] - Returns a specific property of the operation.
    * @param {string} [name] - Search the list of operations on any property.
    * @example
    * {{# withOperation name="Address (Create)" }} {{ id }} {{/ withOperation }}
    * {{ getOperation name="Address (Create)" property="description" }}
    **/
    getOperation: function (context) {

      var operations = params.assemble.options.data.operations;
      if (!operations) {
        return '';
      }

      var hasProperty = context.hash.property !== 'undefined',
        filtered = operations.filter(function (item) {
          var prop;
          for (prop in context.hash) {
            if (context.hash.hasOwnProperty(prop) && prop !== 'property') {
              if (!item.hasOwnProperty(prop) || item[prop].indexOf(context.hash[prop]) === -1) {
                return false;
              }
            }
          }
          return true;
        });

      if (filtered.length === 1) {
        filtered = filtered[0];
      }

      if (hasProperty && typeof filtered[context.hash.property] !== 'undefined') {
        filtered = filtered[context.hash.property];
      }

      return filtered;
    },

    /**
    * Shortcut for this "{{ getOperation name='Address (Create)' property='id' }}"
    * AND, more importantly, it corrects the azure links.
    **/
    getOperationUri: function (context) {
      var operation = Handlebars.helpers.getOperation(context);
      if (operation) {
        return operation.id.replace('/apis/', 'docs/services/');
      }
    },

    /**
    * Presents a context with the results returned from getOperation
    * @param {array} [context.hash] - Optional key/value pairs to pass to @getOperation
    **/
    withOperation: function (context) {
      return context.fn(Handlebars.helpers.getOperation(context));
    },

    /**
    * Compares "uri" in the current context (or the first parameter) to the current URL
    * http://assemble.io/docs/FAQ.html
    **/
    isActiveNav: function (options) {
      var r = isActiveNav(options.hash.dest || this.dest || '', options.hash.uri || this.uri || '', options.hash.parentCanBeActive || true);
      return r ? options.fn(this) : options.inverse(this);
    },

    /**
    * Is the current page home
    **/
    isHome: function (options) {
      var b = basename(options.hash.dest || this.page.dest || 'NOT_HOME', true);
      return b === '' ? options.fn(this) : options.inverse(this);
    },

    /**
    * Debugging JSON content
    **/
    json: function (context) {
      return JSON.stringify(context);
    },

    /**
    * Does the current page have headings?
    **/
    hasHeadings: function(options) {
      return Handlebars.helpers.eachHeading(options) !== '' ? options.fn(this) : options.inverse(this);
    },

    /**
    * This innocuous looking helper took quite a long time to figure out.
    * It takes the current pages entire RAW source, crompiles it, and loads it in cheerio (jQuery).
    * Then it parses for the relevant headers and executes the template for each one.
    **/
    eachHeading: function (options) {
      var html = getMarked(Handlebars.compile(options.hash.page || '')(params.assemble.options)),
        r = '';

      cheerio(options.hash.selector || 'h2', html).each(function () {
        var el = cheerio(this);
        r = r + options.fn({
          name: el.text(),
          id: el.attr('id'),
          draft: el.parent().hasClass('draft')
        });
      });

      return r;
    },

    /**
    * Finds the current page in the nav and iterates its child links
    * Supports optional modulus parameters.
    **/
    eachChildLink: function (options) {
      var dest = '';
      var nav_links = '';

      if (typeof options.hash.dest !== 'undefined') {
        dest = options.hash.dest;
      } else if (typeof this.page !== 'undefined' && typeof this.page.dest !== 'undefined') {
        dest = this.page.dest;
      }

      if (typeof options.hash.nav_links !== 'undefined') {
        nav_links = options.hash.nav_links;
      } else if (typeof this.stache.config.nav_links !== 'undefined') {
        nav_links = this.stache.config.nav_links;
      }

      var active = getActiveNav(dest, nav_links, false);
      if (active && active.nav_links) {
        active = active.nav_links;
      }
      return Handlebars.helpers.eachWithMod(active, options);
    },

    /**
    * A supplement to the normal each.  Adds modulus parameters:
    *   - firstOrMod0
    *   - lastOrMod1
    **/
    eachWithMod: function (context, options) {
      var r = '',
        counter = 0,
        i = 0,
        m = 0,
        mod = options.hash.mod || 0,
        limit = options.hash.limit || -1,
        j;

      if (context && context.length) {
        j = context.length;
        for (i; i < j; i++) {

          if (limit !== -1 && counter >= limit) {
            break;
          }

          var show = true;
          if (typeof context[i].showInNav !== 'undefined' && context[i].showInNav === false) {
            show = false;
          }


         if (show) {
            m = counter % mod;
            context[i].first = counter === 0;
            context[i].last = counter === j - 1;
            context[i].mod0 = m === 0;
            context[i].mod1 = m === mod - 1;
            context[i].firstOrMod0 = context[i].first || context[i].mod0;
            context[i].lastOrMod1 = context[i].last || context[i].mod1;
            r += options.fn(context[i]);
            counter++;
          }
        }
      }
      return r;
    },

    /**
    * Loop through a certain number of times.
    **/
    loop: function (options) {
      var arr = new Array(options.hash.end);
      return Handlebars.helpers.each(arr, options);
    },

    /**
    * Overriding default markdown helper.
    * See notes above for more information.
    **/
    markdown: function (options) {
      return getMarked(options.fn(this));
    },

    /**
    * If settings say to render, wrap content in div
    **/
    draft: function (options) {
      return params.assemble.options.stache.config.draft ? ('<div class="draft">\r\n\r\n' + getMarked(options.fn(this)) + '\r\n\r\n</div>') : '';
    },

    /**
    * Return the current count for the required property
    **/
    count: function(prop) {
      if (typeof counts[prop] === 'undefined') {
        counts[prop] = 0;
      }
      return counts[prop];
    },

    /**
    * Increment the count for the required property
    **/
    increment: function(prop) {
      counts[prop] = typeof counts[prop] === 'undefined' ? 0 : (counts[prop] + 1);
    },

    /**
    * Render a file.  Search path order: partial, absolute, relative, content folder
    **/
    include: function (file, context, options) {

      if (typeof options === 'undefined') {
        options = context;
        context = this;
      }

      var r = '';
      var template = '';
      var fileWithPath = file;
      var c = merge(context, options.hash);
      var hideYFM = typeof options.hash.hideYFM !== 'undefined' ? options.hash.hideYFM : true;
      var render = typeof options.hash.render !== 'undefined' ? options.hash.render : true;
      var fixNewline = typeof options.hash.fixNewline !== 'undefined' ? options.hash.fixNewline : true;
      var escape = typeof options.hash.escape !== 'undefined' ? options.hash.escape : false;

      if (typeof Handlebars.partials[fileWithPath] !== 'undefined') {
        template = Handlebars.partials[fileWithPath];
      } else {

        if (!fs.existsSync(fileWithPath)) {
          fileWithPath = this.page.src.substr(0, this.page.src.lastIndexOf('/')) + '/' + file;
          if (!fs.existsSync(fileWithPath)) {
            fileWithPath = params.assemble.options.stache.config.content + file;
            if (!fs.existsSync(fileWithPath)) {
              fileWithPath = '';
            }
          }
        }

        if (fileWithPath !== '') {
          template = fs.readFileSync(fileWithPath).toString('utf8');
        }

      }

      // Allows for raw includes
      if (typeof template === 'string' && render) {
        r = Handlebars.compile(template)(c);
      } else if (!render) {
        r = template;
      }

      // I spent an entire day tracking down this bug.
      // Files created on different systems with different line endings freaked this out.
      if (fixNewline) {
        r = r.replace(/\r\n/g, '\n')
      }

      // Hide YAML Front Matter
      if (hideYFM && (r.match(/---/g) || []).length > 1) {
        var start = r.indexOf('---') + 1;
        var end = r.indexOf('---', start);
        r = r.substr(end + 3);
      }

      if (escape) {
        r = r
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;")
          .replace(/'/g, "&#039;");
      }

      return new Handlebars.SafeString(r);
    },

    /**
    * Supports object + arrays
    **/
    length: function (collection) {
      if( collection && collection.length ) return collection.length;
      var length = 0;
      for( var prop in collection ){
          if( collection.hasOwnProperty( prop ) ){
              length++;
          }
      }
      return length;
    },

    /**
    * Total all coverage from instanbul report
    **/
    withCoverageTotal: function (collection, property, options) {

      var r = {
        total: 0,
        covered: 0,
        skipped: 0,
        pct: 0
      };

      for (var file in collection) {
        if (collection[file].hasOwnProperty(property)) {
          r.total += parseInt(collection[file][property].total);
          r.covered += parseInt(collection[file][property].covered);
          r.skipped += parseInt(collection[file][property].skipped);
        }
      }

      if (r.total > 0) {
        r.pct = (r.covered / r.total) * 100;
      }

      if (r.pct < 50) {
        r.cssClass = 'danger';
      } else if (r.pct < 80) {
        r.cssClass = 'warning';
      } else {
        r.cssClass = 'success';
      }

      if (options.hash.fixed && r.pct !== 100) {
        r.pct = toFixed(r.pct, options.hash.fixed);
      }

      return options.fn(r, options);
    },

    raw: function(options) {
      return '<raw>' + options.fn(this) + '</raw>';
    },

    withFirstProperty: function(collection, options) {
      for (var property in collection) {
        return options.fn(collection[property]);
      }
    },

    percent: function(dividend, divisor, options) {
      var r = 0;
      if (dividend === divisor) {
        r = 100;
      } else if (divisor !== 0) {
        r = Math.round(dividend/divisor);
      }
      return r.toFixed(options.hash.toFixed || 0);
    },

    /**
    * Many functions of the site, including grunt-yeomin fails on windows line endings.
    * This helpers replaces those.
    **/
    newline: function(text) {
      return text ? text.replace(/\r\n/g, '\n') : '';
    }

  });
};
