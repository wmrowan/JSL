
var parse = (function(){
    
    // Constructor for parsing rules
    function Rule(productions) {
        // Used to distinguish sub rules from tokens
        this.is_rule = true;
        this.productions = productions;

        // Implements the actual logic of recursive desent parsing
        this.match = function(tokenizer) {
            var tk_chkpt = tokenizer.checkPoint();

            for(var prod_i = 0; prod_i < this.productions.length; prod_i += 2) {
                var production = this.productions[prod_i];

                var matching_elems = [];
                for(var elem_i in production) {
                    var elem = production[elem_i];

                    if(elem.is_rule) {
                        var sub_ast = elem.match(tokenizer);
                        if(sub_ast) {
                            matching_elems.push(sub_ast);
                        } else {
                            // Failure
                            break;
                        }
                    } else {
                        // Elem is a token, match the token
                        var tok = tokenizer.peek();
                        if(tok && (tok.token_type === elem)) {
                            matching_elems.push(tok);
                            tokenizer.next();
                        } else {
                            // This production failed
                            break;
                        }
                    }
                }

                if(matching_elems.length === production.length) {
                    // This production matched, no need to continue
                    return this.productions[prod_i + 1](matching_elems);

                } else {
                    // Failure for this alternative, backtrack
                    tokenizer.rewind(tk_chkpt);
                }
            }

            // else failure for all alternatives
            return null;
        };
    }

    // Parser rules

    var eps = new Rule([
        [], function() {return true;}
    ]);

    var int = new Rule([
        ['int'], function(ms) {return new Ast.Int(ms[0]);},
    ]);

    var float = new Rule([
        ['float'], function(ms) {return new Ast.Int(ms[0]);},
    ]);

    // Think of this as a forward declaration, so much for hoisting
    var expr_ = {};

    function infx(oper) {
        return new Rule([[oper, expr_], function(ms) {return ms[1];}]);
    }

    var infix = new Rule([
        [infx('+')], function(ms) {return [Ast.Plus, ms[0]];},
        [infx('-')], function(ms) {return [Ast.Minus, ms[0]];},
        [infx('/')], function(ms) {return [Ast.Divide, ms[0]];},
        [infx('*')], function(ms) {return [Ast.Multiply, ms[0]];},
        [infx('%')], function(ms) {return [Ast.Mod, ms[0]];},
        [infx('==')], function(ms) {return [Ast.Mod, ms[0]];},
        [infx('<')], function(ms) {return [Ast.Mod, ms[0]];},
        [infx('>')], function(ms) {return [Ast.Mod, ms[0]];},
        [eps], function(ms) {return true;},
    ]);

    function ifx_oper(ms) {
        if(Array.isArray(ms[1])) {
            return new ms[1][0](ms[0], ms[1][1]);
        } else {
            return ms[0];
        }
    }

    var actuals_tail_ = {};
    var actuals_tail = new Rule([
        [',', expr_, actuals_tail_], function(ms) {return true},
        [eps], function(ms) {return true},
    ]);
    actuals_tail_.__proto__ = actuals_tail;

    var actuals = new Rule([
        [expr_, actuals_tail], function(ms) {return true},
        [eps], function(ms) {return true},
    ]);

    var iden_infix_ = {};
    var iden_infix = new Rule([
        ['.', 'iden', iden_infix_], function(ms) {return true},
        ['(', actuals, ')', infix], function(ms) {return true},
        [infix], function(ms) {return true},
    ]);
    iden_infix_.__proto__ = iden_infix;

    var expr = new Rule([
        [int, infix], ifx_oper,
        [float, infix], ifx_oper,
        ['iden', iden_infix], function(ms) {return true},
        ['(', expr_, ')', infix], function(ms) {return ifx_oper([ms[1], ms[3]]);},
    ]);

    // This hack is necessary to ensure that our "forward declaration" works
    expr_.__proto__ = expr;
    
    var formals_tail_ = {};
    var formals_tail = new Rule([
        [',', 'iden', formals_tail_], function(ms) {return true},
        [eps], function(ms) {return true},
    ]);
    formals_tail_.__proto__ = formals_tail;

    var formals = new Rule([
        ['iden', formals_tail], function(ms) {return true},
        [eps], function(ms) {return true},
    ]);

    var statements_ = {};

    var stmt_block = new Rule([
        ['{', statements_, '}'], function(ms) {return true},
    ]);

    var statement = new Rule([
        ['var', 'iden', '=', expr], function(ms) {return true}, 
        ['iden', '=', expr], function(ms) {return true}, 
        [expr], function(ms) {return true}, 
        [eps], function(ms) {return true},
    ]);

    var else_block = new Rule([
        ['else', stmt_block], function(ms) {return true},
        [eps], function(ms) {return true},
    ]);

    var compound_statement = new Rule([
        ['while', '(', expr, ')', '{', statements_, '}'], function(ms) {return true},
        ['if', '(', expr, ')', stmt_block, else_block], function(ms) {return true},
    ]);

    var statements = new Rule([
        [statement, ';', statements_], function(ms) {return true},
        [compound_statement, statements_], function(ms) {return true},
        [eps], function(ms) {return true},
    ]);
    statements_.__proto__ = statements;

    
    var fun_decl = new Rule([
        ['function', '(', formals, ')', stmt_block],
            function(ms) {return true},
        ['function', 'iden', '(', formals, ')', stmt_block],
            function(ms) {return true}
    ]);

    // Defines the starting point for the parse
    var root = fun_decl;

    // Returns the ast of the given javascript
    function parse(src_str) {
        var tokenizer = new Tokenizer(src_str);
        
        var ast = root.match(tokenizer);
        if(!ast) throw "Parse failed";
        return ast;
    }

    return parse;
})();


