
// The tokenizer constructor
function Tokenizer(src_str) {
    
    // Convienience to properly format each token
    function tkn(pattern, constructor) {
        return {
            regex: new RegExp('^' + pattern),
            constructor: constructor
        };
    }

    // Escape special newline characters so we'll match them literally
    function escape_sym(sym) {
        sym = sym.replace("\\", "\\\\");
        sym = sym.replace("+", "\\+");
        sym = sym.replace("*", "\\*");
        sym = sym.replace("[", "\\[");
        sym = sym.replace("]", "\\]");
        sym = sym.replace("(", "\\(");
        sym = sym.replace(")", "\\)");
        sym = sym.replace(".", "\\.");
        return sym;
    }

    // Convienience for declaring keywords and direct symbols
    function sym(word) {
        return tkn(escape_sym(word), function sym(str) {
            this.token_type = word;
        });
    }

    // Add new token types here. Matches will be determined first on length
    // and then on order in this list, e.g int is listed before float so that
    // 123 will match int and not float though both match
    var token_types = [

        // Keywords
        sym('function'),
        sym('var'),
        sym('while'),
        sym('if'),
        sym('else'),
        sym('with'),

        // Operators etc.
        sym('.'),
        sym('+'),
        sym('-'),
        sym('*'),
        sym('/'),
        sym('%'),
        sym('('),
        sym(')'),
        sym('{'),
        sym('}'),
        sym(','),
        sym(';'),
        sym('='),
        sym('=='),
        sym('==='),
        sym('!='),
        sym('!=='),
        sym('>'),
        sym('<'),

        // Identifier
        tkn('[a-zA-Z_$]\\w*', function iden(str) {
            this.token_type = "iden";
            this.value = str;
        }),

        // Integer
        tkn('[+-]?\\d+', function int(str) {
            this.token_type = "int";
            this.value = parseInt(str, 10);
        }),

        // float
        tkn('[+-]?\\d+(\\.\\d+)?', function float(str) {
            this.token_type = "float";
            this.value = parseFloat(str, 10);
        }),
        
    ];

    // Returns the next token in the stream
    function internal_next() {
        // First skip past any white space and comments

        var whiteSpace = /^\s/;
        var c_comment = /^\/\*.*?\*\//;
        var cpp_comment = /^\/\/.*?\n/;
        while(true) {
            if(whiteSpace.test(src_str)) {
                src_str = src_str.replace(whiteSpace, '');
            } else if(c_comment.test(src_str)) {
                src_str = src_str.replace(c_comment, '');
            } else if(cpp_comment.test(src_str)) {
                src_str = src_str.replace(cpp_comment, '');
            } else break;
        }
        
        if(src_str === "") {
            // End of input
            return null;
        }

        var matches = [];
        function add_match(tkn) {
            if(!matches[0]) matches.push(tkn);
            for(var i in matches) {
                if(matches[i].length < tkn.length) {
                    matches.splice(i, 0, tkn);
                }
            }
        };

        for(var i in token_types) {
            var match = token_types[i].regex.exec(src_str);
            if(match) {
                var tok = new token_types[i].constructor(match[0])
                tok.length = match[0].length;
                add_match(tok);
            }
        }

        if(!matches[0]) {
            throw "No match for sequence beginning " +
                    src_str.substr(0, 3) + "...";
        }

        src_str = src_str.slice(matches[0].length);
        return matches[0];
    }

    var tk_stk = [];
    tk_stk.push(internal_next());
    var stk_i = 0;

    this.peek = function() {
        return tk_stk[stk_i];
    }

    this.next = function() {
        stk_i++;
        if(!tk_stk[stk_i]) {
            var ne = internal_next();
            if(ne)
                tk_stk.push(ne);
            else
                stk_i--;
        }
    }

    // These methods allow the parser to "save" a point in
    // the token stream and rewind the stream back if a rule fails
    this.checkPoint = function() {
        return stk_i;
    }

    this.rewind = function(index) {
        stk_i = index;
    }
}
