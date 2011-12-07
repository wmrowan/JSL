
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

                    try {
                        elem.is_rule;
                    } catch(e) {
                        console.log(elem);
                    }

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

    // Rule that uses shunting yard algorithm rather than recursive descent to match
    function InfixRule(constituentRule, operators) {
        // Still a rule, want to be treated as such by the recursive descent rules
        this.is_rule = true;

        this._constituentRule = constituentRule;
        this._operatorProps = {};
        for(var i = 0; i < operators.length; i+=2) {
            var operator = operators[i];
            var constructor = operators[i+1];
            this._operatorProps[operator] = {
                'constructor':constructor,
                'prescedence':i,
            };
        }

        this.match = function(tokenizer) {
            var chkPt = tokenizer.checkPoint();

            var simple_expr_stack = [];
            var operator_stack = [];

            function reduce(op) {
                var expr2 = simple_expr_stack.pop();
                var expr1 = simple_expr_stack.pop();
                var reducedExpr = new op.constructor(expr1, expr2);
                simple_expr_stack.push(reducedExpr);
            }

            // Parse first simple expr
            var result = this._constituentRule.match(tokenizer); 
            if(!result) return null;
            simple_expr_stack.push(result);

            // Parse all operators and simple exprs we can
            while(true) {
                var nextOper = tokenizer.peek();
                var operObj = this._operatorProps[nextOper.token_type];
                if(!operObj) break;
                tokenizer.next();

                var result = this._constituentRule.match(tokenizer); 
                if(!result) break;

                while(true) {
                    var top = operator_stack.pop();
                    if(top && (top.prescedence <= operObj.prescedence)) {
                        // Apply top operator imediately
                        reduce(top);         
                    } else {
                        // Save operator on stack for later
                        if(top) operator_stack.push(top);
                        operator_stack.push(operObj);
                        simple_expr_stack.push(result);
                        break;
                    }
                }
            }

            // Reduce rest of simple expr stack with remaining operators
            while(operator_stack.length) {
                var top = operator_stack.pop();
                reduce(top);
            }

            return simple_expr_stack[0];
        }
    }

    // Parser rules

    var eps = new Rule([
        [], function() {return true;}
    ]);

    var int = new Rule([
        ['int'], function(ms) {return new Ast.Int(ms[0]);},
    ]);

    var float = new Rule([
        ['float'], function(ms) {return new Ast.Float(ms[0]);},
    ]);

    // Think of this as a forward declaration, so much for hoisting
    var expr_ = {};

    var actuals_tail_ = {};
    var actuals_tail = new Rule([
        [',', expr_, actuals_tail_], function(ms) {return [ms[1]].concat(ms[2])},
        [eps], function(ms) {return []},
    ]);
    actuals_tail_.__proto__ = actuals_tail;

    var actuals = new Rule([
        [expr_, actuals_tail], function(ms) {return [ms[0]].concat(ms[1])},
        [eps], function(ms) {return []},
    ]);

    var function_call = new Rule([
        ['iden', '(', actuals, ')'], function(ms) {return new Ast.FunCall(ms[0], ms[2])}
    ]);

    var parens_expr = new Rule([
        ['(', expr_, ')'], function(ms) {return new Ast.ParensExpr(ms[1])},
    ]);

    // Distinct from the token, this is the expression consisting of a single identifier
    var Iden = new Rule([
        ['iden'], function(ms) {return new Ast.IdenExpr(ms[0])}
    ]);

    /*
    var expr = new Rule([
        [int, infix], ifx_oper,
        [float, infix], ifx_oper,
        [function_call, infix], ifx_oper,
        [Iden, infix], ifx_oper,
        [parens_expr, infix], ifx_oper,
    ]);
    */

    var simple_expr = new Rule([
        [int], function(ms) {return ms[0]},
        [float], function(ms) {return ms[0]},
        [function_call], function(ms) {return ms[0]},
        [Iden], function(ms) {return ms[0]},
        [parens_expr], function(ms) {return ms[0]},
    ]);

    // InfixRule uses shunting yard algorithm to match infix expressions
    // Operator precedence is as defined by the ordering here
    var infix_expr = new InfixRule(simple_expr, [
        '.', Ast.FieldAccess,
        '*', Ast.Multiply,
        '/', Ast.Divide,
        '%', Ast.Mod,
        '+', Ast.Plus,
        '-', Ast.Minus,
        '<', Ast.Ltn,
        '>', Ast.Gtn,
        '<=', Ast.Lte,
        '>=', Ast.Gte,
        '==', Ast.Equ,
        '===', Ast.Equ,
    ]);

    var expr = new Rule([
        [infix_expr], function(ms) {return ms[0]},
    ]);

    // This hack is necessary to ensure that our "forward declaration" works
    expr_.__proto__ = expr;
    
    var formals_tail_ = {};
    var formals_tail = new Rule([
        [',', 'iden', formals_tail_], function(ms) {return [ms[1].value].concat(ms[2])},
        [eps], function(ms) {return []},
    ]);
    formals_tail_.__proto__ = formals_tail;

    var formals = new Rule([
        ['iden', formals_tail], function(ms) {return [ms[0].value].concat(ms[1])},
        [eps], function(ms) {return []},
    ]);

    var statements_ = {};

    var stmt_block = new Rule([
        ['{', statements_, '}'], function(ms) {return new Ast.StmtBlk(ms[1])},
    ]);

    var statement = new Rule([
        ['var', 'iden', '=', expr], function(ms) {return new Ast.VarDeclDefStmt(ms[1], ms[3])}, 
        ['var', 'iden'], function(ms) {return new Ast.VarDeclStmt(ms[1])},
        ['iden', '=', expr], function(ms) {return new Ast.VarDefStmt(ms[0], ms[2])}, 
        [expr], function(ms) {return new Ast.ExprStmt(ms[0])}, 
        [eps], function(ms) {return new Ast.EmptyStmt()},
    ]);

    var else_block = new Rule([
        ['else', stmt_block], function(ms) {return true},
        [eps], function(ms) {return true},
    ]);

    var varying_parameter = new Rule([
        ['iden', '=', expr_], function(ms) {return new Ast.VaryingParameter(ms[0], ms[2])},
        ['iden'], function(ms) {return new Ast.VaryingParameter(ms[0])},
    ]);

    var varying_parameters_tail_ = {};
    var varying_parameters_tail = new Rule([
        [',', varying_parameter, varying_parameters_tail_], function(ms) {
            return [ms[1]].concat(ms[2]);
        },
        [eps], function(ms) {return []}
    ]);
    varying_parameters_tail_.__proto__ = varying_parameters_tail;

    var varying_parameters = new Rule([
        [varying_parameter, varying_parameters_tail], function(ms) {
            return [ms[0]].concat(ms[1]);
        },
        [eps], function(ms) {return []}
    ]);

    var compound_statement = new Rule([
        //['while', '(', expr, ')',  stmt_block], function(ms) {return true},
        ['if', '(', expr, ')', stmt_block, else_block], function(ms) {
            return new Ast.IfStmt(ms[2], ms[4], [5])
        },
    ]);

    var statements = new Rule([
        [compound_statement, statements_], function(ms) {return [ms[0]].concat(ms[1])},
        [statement, ';', statements_], function(ms) {return [ms[0]].concat(ms[2])},
        [eps], function(ms) {return []}
    ]);
    statements_.__proto__ = statements;
    
    var uniform_parameters = new Rule([
        [formals], function(ms) {return ms[0]}
    ]);

    var shader_program = new Rule([
        ['function', '(', uniform_parameters, ')', '{',
            statements,
            'with', '(', '(', varying_parameters, ')', ')',
            stmt_block, 
            '}'],
        function(ms) {
            return new Ast.ShaderProgram(ms[2], ms[5], ms[9], ms[12]);
        }
    ]);

    // Defines the starting point for the parse
    var root = shader_program;

    // Returns the ast of the given javascript
    function parse(src_str) {
        var tokenizer = new Tokenizer(src_str);
        
        var ast = root.match(tokenizer);
        if(!ast) throw "Parse failed";
        return ast;
    }

    return parse;
})();


