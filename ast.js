
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

        this.find = function(sym) {
            return this._[sym];
        };

        this.search = function(sym) {
            var found = this._[sym];
            if(found) return found;
            if(this.parnt) return this.parnt.search(sym);
            return false;
        };
    }

    function Symbol(identifier, type) {
        this.iden = identifier;
        this.type = type;
    }

    function VaryingSymbol(identifier, type) {
        this.iden = identifier;
        this.type = type;
        this.is_varying = true;
    }

    function FunctionSymbol(identifier, type_signatures) {
        this.is_function = true;

        this.iden = identifier;
        this.type_signatures = type_signatures;
    }

    function CompoundSymbol(identifier) {
        this.is_compound = true;

        this.iden = identifier;
        this.fields = {};
    }

    function AttributeSymbol(identifier, type) {
        this.is_attribute = true;
        
        this.iden = identifier;
        this.type = type;
    }

    function IndexSymbol(identifier) {
        // It is an error to reference this symbol in the field // TODO 
        // Its mere presence is enough to fundamentally change how we run the shader
        this.is_index = true;
        this.iden = identifier;
    }

    // The current scope will always be available here. Nodes that define new
    // scopes will set this as necessary
    var sym_tab = new Scope(undefined);

    // TODO document builtins

    // Add built in variables and functions to global scope
    var builtins = [
        new FunctionSymbol('vec4', [
                                    ['vec4', ['vec3', 'float']],
                                    ['vec4', ['float', 'float', 'float', 'float']],
                                    ['vec4', ['float']],
                                   ]),
        new FunctionSymbol('vec3', [
                                    ['vec3', ['vec2', 'float']],
                                    ['vec3', ['float', 'float', 'float']],
                                    ['vec3', ['float']],
                                   ]),
        new FunctionSymbol('vec2', [
                                    ['vec2', ['float', 'float']],
                                    ['vec2', ['float']],
                                   ]),
        new FunctionSymbol('texture2D', [['vec4', ['sampler2D', 'vec2']]]),
        new FunctionSymbol('normalize', [
                                         ['vec4', ['vec4']], 
                                         ['vec3', ['vec3']],
                                        ]),
        new FunctionSymbol('dot', [
                                    ['float', ['vec4', 'vec4']],
                                    ['float', ['vec3', 'vec3']],
                                  ]),
        new FunctionSymbol('pow', [['float', ['float', 'float']]]),
        new FunctionSymbol('max', [['float', ['float', 'float']]]),
        new FunctionSymbol('reflect', [['vec3', ['vec3', 'vec3']]]),
        new FunctionSymbol('length', [
                                      ['float', ['vec2']],
                                      ['float', ['vec3']],
                                      ['float', ['vec4']],
                                     ]),
        new Symbol('gl_Position', 'vec4'),
        new Symbol('gl_FragColor', 'vec4'),
    ];

    for(var i in builtins) {
        sym_tab.add(builtins[i]);
    }

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
        this.node_parent = "node";
    }
    Expr.prototype = node_proto;
    var expr_proto = new Expr();

    function IdenExpr(iden) {
        this.node_type = "iden_expr";
        this.node_parent = "expr";
        this.type = undefined;
        this.iden = iden.value;

        this.check = function() {
            var symbol = sym_tab.search(this.iden);
            if(!symbol) {
                throw "Symbol " + this.iden + " not declared";
            }

            this.type = symbol.type;
            this.symbol = symbol;
        }

        this.code_gen = function() {
            emit(this.iden);
        }
    }
    IdenExpr.prototype = expr_proto;
    exports.IdenExpr = IdenExpr;

    // Statement node, used for error checking ast types
    function Stmt() {
        this.node_type = "stmt";
        this.node_parent = "node";

        // Statements don't have types, but they must type check correctly
        this.type = undefined;
    }
    Stmt.prototype = node_proto;
    var stmt_proto = new Stmt();

    // Constant expressions
    function Int(int_tkn) {
        this.node_type = "int";
        this.node_parent = "expr";
        
        // Yes, I know it's an int, but the check function will fill it in
        this.type = undefined;
        this.value = int_tkn.value;

        this.check = function() {
            this.type = "int";
        };

        this.code_gen = function() {
            emit("" + this.value);
        };
    }
    Int.prototype = node_proto;
    exports.Int = Int;

    function Float(float_tkn) {
        this.node_type = "float";
        this.node_parent = "expr";
        
        // Yes, I know it's an int, but the check function will fill it in
        this.type = undefined;
        this.value = float_tkn.value;

        this.check = function() {
            this.type = "float";
        };

        this.code_gen = function() {
            emit("" + this.value);
            if(this.value % 1.0 === 0) {
                emit(".0");
            }
        };
    }
    Float.prototype = node_proto;
    exports.Float = Float;

    function Infix(name, oper) {
        var f = function(expr1, expr2) {
            this.node_type = name;
            this.node_parent = "expr";

            this.type = undefined;
            this.expr1 = expr1;
            this.expr2 = expr2;

            this.check = function() {
                assert_node_type(this.expr1, "expr");
                assert_node_type(this.expr2, "expr");
                this.expr1.check();
                this.expr2.check();

                // TODO figure out this mess
                /*
                assert(this.expr1.type === this.expr2.type,
                        "Operands of " + oper + " expression not of the same type");
                assert(this.expr1.type === "int"
                    || this.expr1.type === "float"
                    ,  oper + " operation applied to non-valid type"
                    );
                //TODO other valid types?
                */

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
        f.prototype = expr_proto;
        exports[name] = f;
    }

    Infix("Plus", "+");
    Infix("Minus", "-");
    Infix("Divide", "/");
    //Infix("Multiply", "*");
    Infix("Mod", "%");
    Infix("Equ", "==");
    Infix("Ltn", "<");
    Infix("Gtn", ">");
    Infix("Lte", "<=");
    Infix("Gte", ">=");

    function Multiply(left, right) {
        this.node_type = "Multiply";
        this.node_parent = "expr";
        this.left = left;
        this.right = right;

        this.check = function() {
            assert_node_type(this.left, "expr");
            assert_node_type(this.right, "expr");
            this.left.check();
            this.right.check();
            
            assert(this.left.type && this.right.type);

            // The type inferrence rules here depend upon the types on the left
            // and right
            if(this.left.type === this.right.type) {
                this.type = this.left.type;
            } else if((this.left.type === "mat4") && 
                      (this.right.type === "vec4")) {
                this.type = "vec4";
            } else if(this.left.type == "vec4" && this.right.type == "float") {
                this.type = "vec4";
            } else if(this.left.type == "vec3" && this.right.type == "float") {
                this.type = "vec3";
            } else if(this.left.type == "float" && this.right.type == "vec3") {
                this.type = "vec3";
            } else if(this.left.type == "float" && this.right.type == "vec4") {
                this.type = "vec4";
            } else {
                throw "Unhandled case: " + this.left.type +
                        " * " + this.right.type;
            }
        }

        this.code_gen = function() {
            this.left.code_gen();
            emit(" * ");
            this.right.code_gen();
        }
    }
    this.prototype = expr_proto;
    exports.Multiply = Multiply;

    function FunCall(funct, actuals) {
        this.node_type = "fun_call";
        this.node_parent = "expr";

        this.type = undefined;
        this.funct_id = funct.value;
        this.actuals = actuals;

        this.check = function() {
            var actuals_types = [];
            for(var i in this.actuals) {
                this.actuals[i].check();
                actuals_types.push(this.actuals[i].type);
            }

            var funct_sym = sym_tab.search(this.funct_id);
            if(!funct_sym) {
                throw "Function " + this.funct_id + " is not defined";
            } else if(!funct_sym.is_function) {
                throw "Symbol " + this.funct_id + " called as if it were a function";
            } else {
                for(var i in funct_sym.type_signatures) {
                    var signature = funct_sym.type_signatures[i];
                    var return_type = signature[0];
                    var parameter_types = signature[1];

                    var failed = false;
                    for(var j in parameter_types) {
                        var param_type = parameter_types[j]; 
                        if(actuals_types[j] !== param_type) {
                            failed = true;
                            break;
                        }
                    }
                    if(!failed) {
                        this.type = return_type;
                        return;
                    }
                }
                throw "Actual parameters " + actuals_types +  " to function " + funct_sym.iden
                      + " do not match formal parameters";
            }
        }

        this.code_gen = function() {
            emit(this.funct_id); 
            emit('(');

            var len = this.actuals.length;
            if(len > 0) {
                this.actuals[0].code_gen();
                for(var i = 1; i < len; i++) {
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

        this.type = null;

        this.baseExpr = base;
        this.fieldExpr = field;

        this.check = function() {
            this.baseExpr.check();

            // Two possibilities:
            //   1. Access field of uniform variable e.g. mesh.pos
            //   2. Swizzling e.g. myVec.xyz

            var base_sym = this.baseExpr.symbol;
            if(base_sym && base_sym.is_compound) {
                // Compound types are not vectors, they have subfields and can't be swizzled

                /*
                var msg = "Access of field on uniform variable requires identifier";
                assert(this.baseExpr.node_type === "iden_expr", msg);
                assert(this.fieldExpr.node_type === "iden_expr", msg);
                */

                var fieldIden = this.fieldExpr.iden;

                var index_symbol = null;

                // This hack, TODO do this in general for compound symbols
                if(base_sym.is_this) {
                    function infer_symbol_from_parameter(formal, actual) {
                        var new_symbol;
                        if(Array.isArray(actual) || 
                                (actual.constructor.name === "Float32Array")) {
                            switch(actual.length) {
                            case 16:
                                new_symbol = new Symbol(formal, 'mat4');
                                break;
                            case 9:
                                new_symbol = new Symbol(formal, 'mat3');
                                break;
                            case 4:
                                // Could be a mat2 but uncommon, assume vec4
                                new_symbol = new Symbol(formal, 'vec4');
                                break;
                            case 3:
                                new_symbol = new Symbol(formal, 'vec3');
                                break;
                            case 2:
                                new_symbol = new Symbol(formal, 'vec2');
                                break;
                            // TODO boolean, integer types
                            default:
                                throw "Unrecognizable parameter type " + actual;
                            }
                        } else if(typeof(actual) === "object") {

                            // Special type (like image) or compound type
                            if(actual.TEXTURE) {
                                new_symbol = new Symbol(formal, 'sampler2D');
                            } else if(actual.ATTRIBUTE) {
                                new_symbol = new AttributeSymbol(formal, actual.type);
                            } else if(actual.INDEX) {
                                // TODO when referenced in the body will be an error
                                new_symbol = new IndexSymbol(formal);
                                if(index_symbol) {
                                    throw "A shader program may only have one index parameter. Found second index parameter "
                                           + formal + " but index parameter " + index_symbol.inden + " already processed.";
                                } else {
                                    index_symbol = new_symbol;
                                }
                            } else {
                                // Assume compound type
                                new_symbol = new CompoundSymbol(formal);
                                for(var field in actual) {
                                    new_symbol.fields[field] =
                                        infer_symbol_from_parameter(field, actual[field]); 
                                }
                            }
                        } else if(typeof(actual) === "number") {
                            // TODO figure out how to distinguish ints and floats
                            new_symbol = new Symbol(formal, 'float');
                        }
                        // TODO booleans

                        if(new_symbol === undefined) {
                            throw "Unable to infer type of " + formal;
                        }

                        return new_symbol;
                    }
                
                    // On demand check the type of this field
                    var actualField = base_sym.actual_this[fieldIden];
                    base_sym.fields[fieldIden] = infer_symbol_from_parameter(fieldIden, actualField);

                    if(index_symbol) {
                        __shade_p__.index_symbol = index_symbol;
                    }
                }

                field_sym = base_sym.fields[fieldIden];
                assert(field_sym, "Field " + fieldIden + " not defined on " + base_sym.iden);

                this.type = field_sym.type;
                this.symbol = field_sym;
            } else {
                // Not a compund, only valid is a swizzle on a vector type

                var match = this.fieldExpr.iden.match(/^[wxyzrgba]{1,4}$/);
                assert(match, "Invalid swizzle format");

                var dimension = this.fieldExpr.iden.length;
                if(dimension == 1) {
                    this.type = 'float';
                } else {
                    this.type = 'vec' + dimension;
                }
                this.is_swizzle = true;
            }
        }

        this.code_gen = function() {
            this.baseExpr.code_gen();
            if(this.is_swizzle) {
                emit('.');
            } else {
                emit('_');
            }
            this.fieldExpr.code_gen();
        }
    }
    FieldAccess.prototype = expr_proto;
    exports.FieldAccess = FieldAccess;

    function ParensExpr(internalExpr) {
        this.node_type = "parens_expr";
        this.node_parent = "expr";

        this.internalExpr = internalExpr;
        this.type = null;

        this.check = function() {
            this.internalExpr.check();    
            this.type = this.internalExpr.type;
        }

        this.code_gen = function() {
            emit('(');
            this.internalExpr.code_gen();
            emit(')');
        }
    }
    ParensExpr.prototype = expr_proto;
    exports.ParensExpr = ParensExpr;

    function EmptyStmt() {
        this.node_type = "empty_stmt";
        this.node_parent = "stmt";
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
        this.node_parent = "stmt";
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
        this.node_parent = "stmt";
        this.type = undefined;

        this.new_var = new_var.value;

        this.check = function() {
            // Newly defined variables should not already have
            // been declared in this scope
            var sym = sym_tab.search(this.new_var);
            if(sym) {
                // Declared in some scope (this or above)
                if(sym.is_varying) {
                    // We won't actually hide the varying
                } else if(sym_tab.find(this.new_var)) {
                    // Already declared in this scope, a no-no
                    throw "Variable " + this.new_var + " has already been " +
                        "declared in this scope";
                } else {
                    // We're hiding an outer scope variable, OK
                    sym_tab.add(new Symbol(this.new_var));
                }
            } else {
                // Not yet declared anywhere, OK
                sym_tab.add(new Symbol(this.new_var));
            }
        }

        this.code_gen = function() {
            var symbol = sym_tab.search(this.new_var);

            // We added it in check, better be there
            assert(symbol, "Symbol " + this.new_var + " not defined");

            // Code check on first definition should have given it a type
            assert(symbol.type, "Symbol " + this.new_var + " declared but not defined");

            if(!symbol.is_varying) {
                emit(symbol.type + " ");
                emit(symbol.iden);
                emit('; ');
            }
        }
    }
    VarDeclStmt.prototype = stmt_proto;
    exports.VarDeclStmt= VarDeclStmt;

    function VarDefStmt(iden, expr) {
        this.node_type = "vardef_stmt";
        this.node_parent = "stmt";
        this.type = undefined;

        this.iden = iden.value;
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
            this.expr.code_gen();
        }
    }
    VarDefStmt.prototype = stmt_proto;
    exports.VarDefStmt = VarDefStmt;

    function VarDeclDefStmt(iden, expr) {
        this.node_type = "vardecldef_stmt";
        this.node_parent = "stmt";
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
        this.node_parent = "node";
        this.type = undefined;

        this.statements = stmt_array;

        this.check = function() {
            for(var i in this.statements) {
                this.statements[i].check();
            }
        }

        this.code_gen = function() {
            emit("{ ");
            for(var i in this.statements) {
                this.statements[i].code_gen();
                emit('; ');
            }
            emit(" }");
        }
    }
    StmtBlk.prototype = node_proto;
    exports.StmtBlk = StmtBlk;

    // TODO IfStmt and other scope defining statments should define a new scope
    function IfStmt(cond, then_clause, else_clause) {
        this.node_type = "if_stmt";
        this.node_parent = "stmt";
        this.type = undefined;

        this.cond = cond;
        this.then_clause = then_clause;
        this.else_clause = else_clause;

        this.check = function() {
            this.cond.check();
            assert(this.cond.type === "bool",
                "Conditional of if statement must evaluate to a boolean");

            this.then_clause.check();

            if(this.else_clause) {
                this.else_clause.check();
            }
        }

        this.code_gen = function() {
            emit("if( ");
            this.cond.code_gen();
            emit(" ) ");
            this.then_cause.code_gen();

            if(this.else_clause) {
                emit(" else ");
                this.else_clause.code_gen();
            }
        }
    }
    IfStmt.prototype = stmt_proto;
    exports.IfStmt = IfStmt;

    function VaryingParameter(iden, expr) {
        this.node_type = "varying";
        this.node_parent = "node";
        this.type = undefined;

        this.iden = iden.value;
        this.expr = expr;

        this.check = function() {
            var symbol = sym_tab.find(this.iden);
            assert(symbol, "I added it, should be here");
            
            if(this.expr) {
                // This varying declaration includes a [re]definition

                this.expr.check();
                if(symbol.type) {
                    // This varying was already set, it must be reset to the same type
                    assert(this.expr.type === symbol.type,
                        "Variable " + symbol.iden + " set to wrong type");
                } else {
                    // We're initializing its type as well
                    symbol.type = this.expr.type;
                }
            } else {
                // This is a simple declaration that this variable is a varying
                // Make sure that it has been initialized

                assert(symbol.type,
                    "Varying parameter " + symbol.iden + " never initialized");
            }

            this.type = symbol.type;
        }

        this.code_gen = function() {
            // Generates the definitions of the varying parameter
            // if it has an associated expression
            
            if(this.expr) {
                emit(this.iden);
                emit(' = ');
                this.expr.code_gen();
                emit(';');
            }
        }
    }
    VaryingParameter.prototype = node_proto;
    exports.VaryingParameter = VaryingParameter;

    function VertexShader(vertex_statements, varyings) {
        this.node_type = "vertex_shader";
        this.node_parent = "node";
        this.type = undefined;

        this.statements = vertex_statements;
        this.varyings = varyings;

        this.check = function() {
            for(var i in this.statements) {
                this.statements[i].check();
            }

            // Varyings should already have been checked
        }

        this.code_gen = function() {
            emit('{ ');
            for(var i in this.statements) {
                this.statements[i].code_gen();
                emit('; ');
            }

            for(var i in this.varyings) {
                this.varyings[i].code_gen();
            }

            emit(' }');
        }
    }

    // TODO URGH!!!!
    var __shade_p__ = null;
    function ShaderProgram(uniforms, vertex_shader, varyings, fragment_shader) {
        this.node_type = "shader_program";
        this.node_parent = "node";
        this.type = undefined;

        this.uniforms = uniforms;
        this.varyings = varyings;
        this.vertex_shader = new VertexShader(vertex_shader, varyings);
        this.fragment_shader = fragment_shader;

        this.inferred_uniform_symbols = undefined;
        this.index_symbol = null; // Will be set if we're given an index
        this.fragment_shader_text = null;
        this.vertex_shader_text = null;
        this.shader_program = null;

        // Infer the types of the uniform parameters from the actual parameters
        this.check_with_actual_parameters = function(ths, actual_parameters) {
            __shade_p__ = this;
            var index_symbol = null;

            function infer_symbol_from_parameter(formal, actual) {
                var new_symbol;
                if(Array.isArray(actual) || 
                        (actual.constructor.name === "Float32Array")) {
                    switch(actual.length) {
                    case 16:
                        new_symbol = new Symbol(formal, 'mat4');
                        break;
                    case 9:
                        new_symbol = new Symbol(formal, 'mat3');
                        break;
                    case 4:
                        // Could be a mat2 but uncommon, assume vec4
                        new_symbol = new Symbol(formal, 'vec4');
                        break;
                    case 3:
                        new_symbol = new Symbol(formal, 'vec3');
                        break;
                    case 2:
                        new_symbol = new Symbol(formal, 'vec2');
                        break;
                    // TODO boolean, integer types
                    default:
                        throw "Unrecognizable parameter type " + actual;
                    }
                } else if(typeof(actual) === "object") {

                    // Special type (like image) or compound type
                    if(actual.TEXTURE) {
                        new_symbol = new Symbol(formal, 'sampler2D');
                    } else if(actual.ATTRIBUTE) {
                        new_symbol = new AttributeSymbol(formal, actual.type);
                    } else if(actual.INDEX) {
                        // TODO when referenced in the body will be an error
                        new_symbol = new IndexSymbol(formal);
                        if(index_symbol) {
                            throw "A shader program may only have one index parameter. Found second index parameter "
                                   + formal + " but index parameter " + this.index_symbol.inden + " already processed.";
                        } else {
                            index_symbol = new_symbol;
                        }
                    } else {
                        // Assume compound type
                        new_symbol = new CompoundSymbol(formal);
                        for(var field in actual) {
                            new_symbol.fields[field] =
                                infer_symbol_from_parameter(field, actual[field]); 
                        }
                    }
                } else if(typeof(actual) === "number") {
                    // TODO figure out how to distinguish ints and floats
                    new_symbol = new Symbol(formal, 'float');
                }
                // TODO booleans

                if(new_symbol === undefined) {
                    throw "Unable to infer type of " + formal;
                }

                return new_symbol;
            }

            this.inferred_uniform_symbols = [];
            for(var i in actual_parameters) {
                var parameter = actual_parameters[i];
                var iden = this.uniforms[i];
                var new_symbol = infer_symbol_from_parameter(iden, parameter);
                this.inferred_uniform_symbols.push(new_symbol);
            }

            // Add this symbol
            var this_symbol = new CompoundSymbol('this');

            // This is pretty hacky. The idea is that we don't want
            // to compute the types of everything defined on this. Instead
            // we'll on demand check the types of fields actually used.
            // TODO we should probably take this approach to all uniforms
            this_symbol.is_this = true;
            this_symbol.actual_this = ths;
            this.inferred_uniform_symbols.push(this_symbol);

            this.index_symbol = index_symbol;
            this.check();
        };

        this.check = function() {
            __shade_p__ = this;
            this.global_scope = sym_tab;

            // Add uniforms and varyings to top level scope
            assert(this.inferred_uniform_symbols);
            for(var i in this.inferred_uniform_symbols) {
                // Uniform types are inferred from the types of the actual arguments
                sym_tab.add(this.inferred_uniform_symbols[i]);
            }

            // Varyings don't yet have types
            for(var i in this.varyings) {
                sym_tab.add(new VaryingSymbol(this.varyings[i].iden));
            }

            // Vertex shader defines new scope
            this.vertex_scope = new Scope(this.global_scope);
            sym_tab = this.vertex_scope;

            // Check vertex shader
            this.vertex_shader.check();

            // Pop scope back to global
            sym_tab = this.global_scope;

            // Varyings assigned to in the vertex shader should have types now

            // Other varyings will get types defined now
            for(var i in this.varyings) {
                this.varyings[i].check();
            }

            // Fragment shader defines a scope as well
            this.fragment_scope = new Scope(this.global_scope);
            sym_tab = this.fragment_scope;

            // All varyings should have types defined
            this.fragment_shader.check();

            // Pop scope
            sym_tab = this.global_scope;
        }

        function gen_attribute(iden_prefix, symbol) {
            assert(!symbol.is_function, "Attribute can't be a function");

            if(symbol.is_compound) {
                iden_prefix += symbol.iden + '_';
                for(f in symbol.fields) {
                    var field_sym = symbol.fields[f];
                    gen_attribute(iden_prefix, field_sym);
                }
            } else if(symbol.is_attribute) {
                emit("attribute ");
                emit(symbol.type + ' ');
                emit(iden_prefix + symbol.iden);
                emit(';');
            } // else not the scope of this function
        }

        function gen_attributes(symbols) {
            for(var i in symbols) {
                var symbol = symbols[i];
                gen_attribute('', symbol);
            }
        }

        function gen_uniform(iden_prefix, symbol) {
            assert(!symbol.is_function, "Uniform can't be a function");

            if(symbol.is_compound) {
                iden_prefix += symbol.iden + '_';
                for(f in symbol.fields) {
                    var field_sym = symbol.fields[f];
                    gen_uniform(iden_prefix, field_sym);
                }
            } else if(symbol.is_attribute || symbol.is_index) {
                // Skip, not a uniform
            } else {
                emit("uniform ");
                emit(symbol.type + ' ');
                emit(iden_prefix + symbol.iden);
                emit(';');
            }
        }

        function gen_uniforms(symbols) {
            for(var i in symbols) {
                var symbol = symbols[i];
                gen_uniform('', symbol);
            }
        }

        function gen_varyings(varyings) {
            for(var i in varyings) {
                var varying = varyings[i];
                emit("varying ");
                emit(varying.type + ' ');
                emit(varying.iden + ';');
            }
        }

        this.code_gen = function() {
            // Really two separate code gen, vertex and fragment

            // Gen declarations

            emit_reciever = "";
            gen_attributes(this.inferred_uniform_symbols);
            var attribute_declarations = emit_reciever;

            emit_reciever = "";
            gen_uniforms(this.inferred_uniform_symbols);
            var uniform_declarations = emit_reciever;

            emit_reciever = "";
            gen_varyings(this.varyings);
            var varyings_declarations = emit_reciever;

            // Gen vertex shader code

            sym_tab = this.vertex_scope;
            emit_reciever = "";
            this.vertex_shader.code_gen();
            sym_tab = this.global_scope;
            var vertex_text = emit_reciever;

            // Gen fragment shader code

            sym_tab = this.fragment_scope;
            emit_reciever = "";
            this.fragment_shader.code_gen();
            var fragment_text = emit_reciever;
            sym_tab = this.global_scope;

            // Combine it all
            var full_vertex_shader =
                attribute_declarations + 
                uniform_declarations + 
                varyings_declarations + 
                "void main(void)" + 
                vertex_text;

            var full_fragment_shader =
                "precision highp float;" +
                uniform_declarations +
                varyings_declarations +
                "void main(void)" +
                fragment_text;

            this.vertex_shader_text = full_vertex_shader;
            this.fragment_shader_text = full_fragment_shader;
        }

        this.compile = function(_gl) {
            var sp = _gl.createProgram();
            var vert = _gl.createShader(_gl.VERTEX_SHADER);
            _gl.shaderSource(vert, this.vertex_shader_text);
            _gl.compileShader(vert);

            if (!_gl.getShaderParameter(vert, _gl.COMPILE_STATUS)) {
                throw "Shader compile error: "+ _gl.getShaderInfoLog(vert) +
                      this.vertex_shader_text;
            }

            var frag = _gl.createShader(_gl.FRAGMENT_SHADER);
            _gl.shaderSource(frag, this.fragment_shader_text);
            _gl.compileShader(frag);

            if (!_gl.getShaderParameter(frag, _gl.COMPILE_STATUS)) {
                throw "Shader compile error: "+ _gl.getShaderInfoLog(frag);
            }

            _gl.attachShader(sp, vert);
            _gl.attachShader(sp, frag);
            _gl.linkProgram(sp);

            if(!_gl.getProgramParameter(sp, _gl.LINK_STATUS)) {
                throw "SHADER PROGRAM: " + _gl.getProgramInfoLog(sp);
            }

            // Find the parameter locations for reuse
            function find_symbol_location(prefix, symbol) {
                if(symbol.is_compound) {
                    for(var i in symbol.fields) {
                        find_symbol_location(prefix + symbol.iden + '_',
                            symbol.fields[i], _gl, sp);
                    }
                } else {
                    var loc;
                    if(symbol.is_index) {
                        // Do nothing
                    } else if(symbol.is_attribute) {
                        symbol.location = _gl.getAttribLocation(sp, prefix + symbol.iden);
                    } else {
                        symbol.location = _gl.getUniformLocation(sp, prefix + symbol.iden);
                    }
                }
            }

            /*
            for(var i in this.uniforms) {
                var uni = this.uniforms[i];
                var symbol = sym_tab.search(uni);
                find_symbol_location('', symbol);
            }
            */

            for(var i in this.inferred_uniform_symbols) {
                var symbol = this.inferred_uniform_symbols[i];
                find_symbol_location('', symbol);
            }

            this.shader_program = sp;
        }

        this.bind_and_draw = function(ths, params, _gl) {
            __shade_p__ = this;
            // Our 'this' sybol has been pushed to the end of inferred_parameters 
            Array.prototype.push.call(params, ths);

            var textures_allocated = 0;
            var num_elements = null;

            function bind_param(symbol, param) {
                // TODO typecheck these parameters
                if(symbol.is_compound) {
                     for(var i in symbol.fields) {
                        bind_param(symbol.fields[i], param[i], _gl);
                     }
                } else if(symbol.is_index) {
                    _gl.bindBuffer(_gl.ELEMENT_ARRAY_BUFFER, param.buffer);
                    num_elements = param.length;
                } else if(symbol.is_attribute) {
                    // This attribute might not actually be used in the program
                    if(symbol.location >= 0) {
                        _gl.bindBuffer(_gl.ARRAY_BUFFER, param.buffer);
                        _gl.enableVertexAttribArray(symbol.location);
                        _gl.vertexAttribPointer(symbol.location, param.stride,
                            param.dataType, false, 0, 0);
                        _gl.bindBuffer(_gl.ARRAY_BUFFER, null);

                        //Infer the number of elements from the length of this attribute
                        if(!num_elements) {
                            num_elements = param.length;
                        }
                    }
                } else {
                    switch(symbol.type) {
                    case "float":
                        _gl.uniform1f(symbol.location, param);
                        break;
                    case "vec2":
                        _gl.uniform2fv(symbol.location, new Float32Array(param));
                        break;
                    case "vec3":
                        _gl.uniform3fv(symbol.location, new Float32Array(param));
                        break;
                    case "vec4":
                        _gl.uniform4fv(symbol.location, new Float32Array(param));
                        break;
                    case "ivec2":
                        _gl.uniform2iv(symbol.location, new Int32Array(param));
                        break;
                    case "ivec3":
                        _gl.uniform3iv(symbol.location, new Int32Array(param));
                        break;
                    case "ivec4":
                        _gl.uniform4iv(symbol.location, new Int32Array(param));
                        break;
                    case "mat2":
                        _gl.uniformMatrix2fv(symbol.location, false, new Float32Array(param));
                        break;
                    case "mat3":
                        _gl.uniformMatrix3fv(symbol.location, false, new Float32Array(param));
                        break;
                    case "mat4":
                        _gl.uniformMatrix4fv(symbol.location, false, new Float32Array(param));
                        break;
                    case "sampler2D":
                        _gl.activeTexture(_gl['TEXTURE' + textures_allocated]);
                        _gl.bindTexture(_gl.TEXTURE_2D, param);
                        _gl.uniform1i(symbol.location, textures_allocated);
                        textures_allocated++;
                        break;
                    default:
                        throw "Unrecognized uniform type: " + symbol.type;
                    }
                }
            }

            _gl.useProgram(this.shader_program);

            // Bind the parameters (this will set num_elements)
            for(var i in this.inferred_uniform_symbols) {
                var symbol = this.inferred_uniform_symbols[i];
                var param = params[i];
                bind_param(symbol, param)
            }

            // Draw!
            if(this.index_symbol) {
                _gl.drawElements(_gl.TRIANGLES, num_elements, _gl.UNSIGNED_SHORT, 0);
                _gl.bindBuffer(_gl.ELEMENT_ARRAY_BUFFER, null);
            } else {
                _gl.drawArrays(_gl.TRIANGLES, 0, num_elements);
            }
        }
    }
    ShaderProgram.prototype = node_proto;
    exports.ShaderProgram = ShaderProgram;

    // Utility functions

    var emit_reciever = '';

    function emit(str) {
        emit_reciever += str;
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
