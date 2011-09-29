
Ast = {};
(function(exports){

    // The symbol table

    // Nodes that define new scopes are responsible for pushing a new scope
    // onto the stack when needed and popping it off when they are done

    function Scope(parnt) {
        this.parnt = parnt;
        this._ = {};
        
        this.add = function(sym, val) {
            this._[sym] = (val || true);
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
