
Ast = {};
(function(exports){

    // The symbol table

    // Nodes that define new scopes are responsible for pushing a new scope
    // onto the stack when needed and popping it off when they are done

    function Scope(parnt) {
        this.parnt = parnt;
        this._ = {};
        
        this.add = function(sym) {
            this._[sym.iden] = sym;
        };

        this.find = function(sum) {
            return this._[sym];
        };

        this.search = function(sym) {
            var found = this._[sym];
            if(found) return found;
            if(this.parnt) return this.parnt.search(sym);
            return false;
        };
    }

    function Symbol(identifier) {
        this.iden = identifier;
        this.type = null;
    }

    // The current scope will always be available here. Nodes that define new
    // scopes will set this as necessary
    var sym_tab = new Scope(undefined);

    // Ast node types

    // Most semantic checking and code gen code is expressed as ast members.
    // Tree traversal is done through recursive ast calls.

    // Prototype for all ast nodes
    function Node() {

        // The node type is used internally to ensure correct ast construction
        this.node_type = "node";
        this.node_parent = null;

        // All nodes have a type field set by the check method
        this.type = undefined;

        // Check performs semantic analysis first on all children of this
        // node and then on this node. Will set the type field before returning
        this.check = undefined;

        // Generates code for this node, calls code gen for child nodes
        this.code_gen = undefined;
    }
    var node_proto = new Node();

    // Expression node, used for error checking ast types
    function Expr() {
        this.node_type = "expr";
        this.node_parent = node_proto;
    }
    Expr.prototype = node_proto;
    var expr_proto = new Expr();

    // Statement node, used for error checking ast types
    function Stmt() {
        this.node_type = "stmt";
        this.node_parent = node_proto;

        // Statements don't have types, but they must type check correctly
        this.type = undefined;
    }
    Stmt.prototype = node_proto;
    var stmt_proto = new Stmt();

    // Constant expressions
    function Int(int_tkn) {
        this.node_type = "int";
        this.node_parent = expr_proto;
        
        // Yes, I know it's an int, but the check function will fill it in
        this.type = undefined;
        this.value = int_tkn.value;

        this.check = function() {
            this.type = "int";
        };

        this.code_gen = function() {
            
        };
    }
    Int.prototype = node_proto;
    exports.Int = Int;

    function Float(float_tkn) {
        this.node_type = "float";
        this.node_parent = expr_proto;
        
        // Yes, I know it's an int, but the check function will fill it in
        this.type = undefined;
        this.value = float_tkn.value;

        this.check = function() {
            this.type = "float";
        };

        this.code_gen = function() {
            assert(false);
        };
    }
    Float.prototype = node_proto;
    exports.Float = Float;

    function Infix(name, oper) {
        var f = function(expr1, expr2) {
            this.node_type = name;
            this.node_parent = expr_proto;

            this.type = undefined;
            this.expr1 = expr1;
            this.expr2 = expr2;

            this.check = function() {
                assert_node_type(this.expr1, "expr");
                assert_node_type(this.expr2, "expr");
                this.expr1.check();
                this.expr2.check();

                assert(this.expr1.type === this.expr2.type,
                        "Operands of " + oper + " expression not of the same type");
                assert(this.expr1.type === "int"
                    || this.expr1.type === "float"
                    ,  oper + " operation applied to non-valid type"
                    );
                //TODO other valid types?

                // Assuming that operands must be of same type (int, float etc.)
                // then type of an arithmetic infix is just that same type
                this.type = this.expr1.type;
            };

            this.code_gen = function() {
                expr1.code_gen();
                emit(" " + oper + " ");
                expr2.code_gen();
            };
        };
        f.prototype = node_proto;
        exports[name] = f;
    }

    Infix("Plus", "+");
    Infix("Minus", "-");
    Infix("Divide", "/");
    Infix("Multiply", "*");
    Infix("Mod", "%");
    Infix("Equ", "==");
    Infix("Ltn", "<");
    Infix("Gtn", ">");
    Infix("Lte", "<=");
    Infix("Gte", ">=");

    function FunCall(funct, actuals) {
        this.node_type = "fun_call";
        this.node_parent = "expr";

        this.type = undefined;
        this.funct_id = funct;
        this.actuals = actuals;

        this.check = function() {
            var actuals_types = [];
            for(i in this.actuals_array) {
                this.actuals_array[i].check();
                actuals_types.push(this.actuals_array[i].type);
            }

            var funct_sym = sym_tab.search(this.funct_id);
            if(!funct_sym) {
                throw "Function " + this.funct_id + " is not defined";
            } else if(!funct_sym.is_function) {
                throw "Symbol " + this.funct_id + " called as if it were a function";
            } else {
                // TODO check that the actual parameters match the function signature

                this.type = funct_sym.return_type;
            }
        }

        this.code_gen = function() {
            emit(this.funct_id); 
            emit('(');

            var len = this.actuals.length;
            if(len > 0) {
                this.actuals[0].code_gen();
                for(var i = 0; i < len; i++) {
                    emit(', ');
                    this.actuals[i].code_gen();
                }
            }

            emit(')');
        }
    }
    FunCall.prototype = expr_proto;
    exports.FunCall = FunCall;

    function FieldAccess(base, field) {
        this.node_type = "field_access";
        this.node_parent = "expr";

        this.type = undefined;
        this.base = base;
        this.field = field;

        this.check = function() {
            var base_sym = sym_tab.search(this.base);   
            if(!base_sym) {
                throw "Variable " + this.base + " is not defined";
            }

            var field_sym = base_sym.get_field(this.field);
            if(!field_sym) {
                throw "Field " + this.field + " is not defined on " + this.base;
            }

            this.type = field_sym.type;
        }

        this.code_gen = function() {
            emit(this.base);
            emit('.');
            emit(this.field);
        }
    }
    FieldAccess.prototype = expr_proto;
    exports.FieldAccess = FieldAccess;

    function EmptyStmt() {
        this.node_type = "empty_stmt";
        this.node_parent = stmt_proto;
        this.type = undefined;

        this.check = function() {
            // no-op
        }

        this.code_gen = function() {
            // no-op
        }
    }
    EmptyStmt.prototype = stmt_proto;
    exports.EmptyStmt = EmptyStmt;

    function ExprStmt(expr) {
        this.node_type = "expr_stmt";
        this.node_parent = stmt_proto;
        this.type = undefined;

        this.expr = expr;

        this.check = function() {
            this.expr.check();
        }

        this.code_gen = function() {
            this.expr.code_gen();
            emit('; ');
        }
    }
    ExprStmt.prototype = stmt_proto;
    exports.ExprStmt = ExprStmt;

    function VarDeclStmt(new_var) {
        this.node_type = "vardecl_stmt";
        this.node_parent = stmt_proto;
        this.type = undefined;

        this.new_var = new_var;

        this.check = function() {
            // Newly defined variables should not already have
            // been declared in this scope
            var sym = sym_tab.find(this.new_var);
            if(sym) {
                throw "Variable " + this.new_var + " has already been " +
                      "declared in this scope";
            }

            // We don't know the type now. It will get fixed on first assignment.
            // We don't actually have to know the type until code_gen anyway.
            sym_tab.add(new Symbol(this.new_var));
        }

        this.code_gen = function() {
            var symbol = sym_tab.find(this.new_var);

            // We added it in check, better be there
            assert(symbol, "Symbol " + this.new_var + " not defined");

            // Code check on first definition should have given it a type
            assert(symbol.type, "Symbol " + this.new_var + " declared but not defined");

            emit(symbol.type + " ");
            emit(symbol.iden);
            emit('; ');
        }
    }
    VarDeclStmt.prototype = stmt_proto;
    exports.VarDeclStmt= VarDeclStmt;

    function VarDefStmt(iden, expr) {
        this.node_type = "vardef_stmt";
        this.node_parent = stmt_proto;
        this.type = undefined;

        this.iden = iden;
        this.expr = expr;

        this.check = function() {
            this.expr.check();
            assert(this.expr.type, "Expr type check failed");

            // Identifier must already have been declared
            var symbol = sym_tab.search(this.iden);
            if(!symbol) {
                throw "Variable " + this.iden + " has not been declared";
            }

            if(!symbol.type) {
                // This variable has not been defined yet, first assignment sets its type
                symbol.type = this.expr.type;
            } else {
                // All following redefinitions must conform to the initial type
                assert(symbol.type === this.expr.type, "Attempt to set variable of type " +
                        symbol.type + " to value of type " + this.expr.type);
            }
        }

        this.code_gen = function() {
            emit(this.iden);
            emit(" = ");
            this.expr.emit();
        }
    }
    VarDefStmt.prototype = stmt_proto;
    exports.VarDefStmt = VarDefStmt;

    function VarDeclDefStmt(iden, expr) {
        this.node_type = "vardecldef_stmt";
        this.node_parent = stmt_proto;
        this.type = undefined;

        // We treat this case as declaration followed by a definition
        this.decl = new VarDeclStmt(iden);
        this.def = new VarDefStmt(iden, expr);

        this.check = function() {
            this.decl.check();
            this.def.check();
        }

        this.code_gen = function() {
            this.decl.code_gen();
            this.def.code_gen();
        }
    }
    VarDeclDefStmt.prototype = stmt_proto;
    exports.VarDeclDefStmt = VarDeclDefStmt;

    function StmtBlk(stmt_array) {
        this.node_type = "stmt_blk";
        this.node_parent = node_proto;
        this.type = undefined;

        this.statements = stmt_array;

        this.check = function() {
            for(i in this.statements) {
                this.statements[i].check();
            }
        }

        this.code_gen = function() {
            emit("{ ");
            for(i in this.statements) {
                this.statements[i].code_gen();
            }
            emit(" }");
        }
    }
    StmtBlk.prototype = node_proto;
    exports.StmtBlk = StmtBlk;

    /*
    function function_decl(name, formals, statements) {
        this.node_type = "function decl";
        this.node_parent = stmt_proto;
        
        // TODO Check for return statements and set type?
        this.type = "void";

        this.check = function() {
            assert(!symtab.find(name),
                "Cannot define function " + name + ", already defined in this scope");

            // Add this function to the symbol table 
            sym_tab.add(name, this);

            // Enter a new scope
            this.scope = new Scope(sym_tab);
            sym_tab = this.scope;

            // Add formals to sym tab
            for(formal_i in formals) {
                var formal = formals[formal_i];
                sym_tab.add(formal);
            }

            // Check statements
            for(statement_i in statements) {
                var statement = statements[statement_i];
                statement.check();
            }

            // Pop the sym-tab
            sym_tab = this.scope.parnt;
        };

        this.code_gen = function() {
            assert(false);
        };
    }
    Float.prototype = node_proto;
    exports.Float = Float;
    */

    // Utility functions

    function emit(str) {
        throw "emit not yet implemented";
    }

    function assert_node_type(node, type) {
        var n_type = node.node_type;
        while(n_type !== type) {
            n_type = node.node_parent;
            if(n_type === null)
                throw "Node of type " + node.node_type +
                        " should be of type " + type;
        }
    }

    function assert(bool, msg) {
        if(!bool) throw msg;
    }

})(Ast);
