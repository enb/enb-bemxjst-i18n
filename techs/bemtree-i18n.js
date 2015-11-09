var EOL = require('os').EOL,
    vow = require('vow'),
    keysets = require('enb-bem-i18n/lib/keysets'),
    compileI18N = require('enb-bem-i18n/lib/compile');

/**
 * @class BemhtmlI18nTech
 * @augments {BemhtmlTech}
 * @classdesc
 *
 * Compiles localized BEMTREE template files with BEMXJST translator and merges them into a single BEMTREE bundle.
 *
 * Localization is based on pre-built `?.keysets.{lang}.js` bundle files.
 *
 * Important: It supports only JS syntax by default. Use `compat` option to support old BEMTREE syntax.
 *
 * @param {Object}    options                                      Options
 * @param {String}    [options.target='?.bemtree.{lang}.js']       Path to a target with compiled file.
 * @param {String}    [options.filesTarget='?.files']              Path to a target with BEMTREE FileList.
 * @param {String[]}  [options.sourceSuffixes]                     Files with specified BEMTREE suffixes
 *                                                                 involved in the assembly.
 * @param {String}    options.lang                                 Language identifier.
 * @param {String}    [options.keysetsFile='?.keysets.{lang}.js']  Path to a source keysets file.
 * @param {String}    [options.exportName='BEMTREE']               Name of BEMTREE template variable.
 * @param {Boolean}   [options.compat=false]                       Sets `compat` option to support old BEMTREE syntax.
 * @param {Boolean}   [options.devMode=true]                       Sets `devMode` option for convenient debugging.
 *                                                                 If `devMode` is set to true, code of templates will
 *                                                                 not be compiled but only wrapped for development
 *                                                                 purposes.
 * @param {Boolean}   [options.cache=false]                        Sets `cache` option for cache usage.
 * @param {Object}    [options.requires]                           Names of dependencies which should be available from
 *                                                                 code of templates.
 *
 * @example
 * var BemhtmlI18nTech = require('enb-bemxjst-i18n/techs/bemtree-i18n'),
 *     KeysetsTech = require('enb-bem-i18n/techs/keysets'),
 *     FileProvideTech = require('enb/techs/file-provider'),
 *     bemTechs = require('enb-bem-techs');
 *
 * module.exports = function(config) {
 *     config.setLanguages(['en', 'ru']);
 *
 *     config.node('bundle', function(node) {
 *         // get FileList
 *         node.addTechs([
 *             [FileProvideTech, { target: '?.bemdecl.js' }],
 *             [bemTechs.levels, { levels: ['blocks'] }],
 *             [bemTechs.deps],
 *             [bemTechs.files]
 *         ]);
 *
 *         // collect and merge keysets files into bundle
 *         node.addTech([KeysetsTech, { lang: '{lang}' }]);
 *
 *         // build localized BEMTREE file for each lang
 *         node.addTech([BemhtmlI18nTech, { lang: '{lang}' }]);
 *         node.addTarget('?.bemtree.{lang}.js');
 *     });
 * };
 */
module.exports = require('enb-bemxjst/techs/bemtree').buildFlow()
    .name('bemtree-i18n')
    .target('target', '?.bemtree.{lang}.js')
    .defineRequiredOption('lang')
    .useSourceFilename('keysetsFile', '?.keysets.{lang}.js')
    .builder(function (fileList, keysetsFilename) {
        // don't add fat wrapper code of bem-xjst
        if (fileList.length === 0) {
            return this._mockBEMTREE();
        }

        return vow.all([
            this._getBEMTREESources(fileList),
            this._compileI18N(keysetsFilename)
        ]).spread(function (BEMTREESources, I18NCode) {
            // i18n will be available in templates by `this.i18n`
            var sources = BEMTREESources.concat({
                contents: [
                    'oninit(function(exports, context) {',
                    '    var BEMContext = exports.BEMContext || context.BEMContext;',
                    '    BEMContext.prototype.i18n = ' + I18NCode + ';',
                    '});'
                ].join(EOL)
            });

            return this._compileBEMXJST(sources, 'bemtree');
        }, this);
    })
    .methods({
        /**
         * Reads source code of BEMTREE templates and processes.
         *
         * @param {FileList} fileList — objects that contain file information.
         * @returns {Promise}
         * @private
         */
        _getBEMTREESources: function (fileList) {
            var filenames = this._getUniqueFilenames(fileList);

            return this._readFiles(filenames)
                .then(this._processSources, this);
        },
        /**
         * Compiles i18n module.
         *
         * Wraps compiled code for usage with different modular systems.
         *
         * @param {String} keysetsFilename — path to file with keysets..
         * @returns {Promise}
         * @private
         */
        _compileI18N: function (keysetsFilename) {
            return this._readKeysetsFile(keysetsFilename)
                .then(function (keysetsSource) {
                    var parsed = keysets.parse(keysetsSource),
                        opts = {
                            version: parsed.version,
                            language: this._lang
                        };

                    return compileI18N(parsed.core, parsed.keysets, opts);
                }, this);
        },
        /**
         * Reads file with keysets.
         *
         * @param {String} filename — path to file with keysets.
         * @returns {Promise}
         * @private
         */
        _readKeysetsFile: function (filename) {
            var node = this.node,
                root = node.getRootDir(),
                cache = node.getNodeCache(this._target);

            return keysets.read(filename, cache, root);
        }
    })
    .createTech();
