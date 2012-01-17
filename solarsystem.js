
function runDemo(canvas_string) {
    // Javascript utilities 

    // Call "inherit(this, parent)" in a constructor to inherit from 
    // a fresh object of the parent constructor. Multiple calls will
    // chain prototypes. Priority is in reverse order.
    function inherit(obj, parentConstructor) {
        //var old_prototype = obj.__proto__;
        obj.__proto__ = new parentConstructor();
        //obj.__proto__.__proto__ = old_prototype;
    }

    function toRad(degrees) {
        return Math.PI * degrees / 180;
    }

    // Constnats

    var GL_OPTIONS = {
        'clearColor': [0.0, 0.0, 0.0, 1.0],
    };
    var STATIC_FILES_DIRECTORY = "";
    var TEXTURE_DIRECTORY = STATIC_FILES_DIRECTORY + "textures/";

    // Will be initialized to webgl context object
    var gl;
    var canvas = document.getElementById(canvas_string);

    // Utility functions

    function staticTexture(textureName) {
        return new gl.Texture(TEXTURE_DIRECTORY + textureName);
    }

    // Scene object constructors

    function Sky() {
        this._texture = staticTexture("fullskyLarge.jpg");
        this._mesh = gl.Shapes.sphere;
        this._viewMat = mat4.create();
        mat4.identity(this._viewMat);
        this._modelMat = mat4.create();
        mat4.identity(this._modelMat);
        mat4.rotateX(this._modelMat, toRad(60));

        this.setViewVector = function(viewVector) {
            mat4.lookAt([0,0,0], viewVector, [0,1,0], this._viewMat);
        };

        this._shader = gl.ShaderFunction(function(vpMat) {
            gl_Position = vpMat * vec4(this._mesh.pos, 1.0);
            with((texcoord = this._mesh.texcoord)) {
                var color = texture2D(this._texture, texcoord).rgb;
                gl_FragColor = vec4(0.5 * color, 1.0);
            }
        });

        this.draw = function() {
            var mat = mat4.create();
            mat4.identity(mat);
            mat4.multiply(mat, gl.transforms.projectionMatrix);
            mat4.multiply(mat, this._viewMat);
            mat4.multiply(mat, this._modelMat);
            
            gl.disable(gl.DEPTH_TEST)
            this._shader(mat);
            gl.enable(gl.DEPTH_TEST)
        }
    }

    function Positioned() {
        this._position = new Float32Array(3);
        
        // Move this object to a new cartesian coordinate 
        this.moveTo = function(newPosition) {
            this._position = newPosition;
        }

        // Move this object to a new sphereical coordinate 
        this.moveToSphereical = function(spheCoord) {
            // Convert to cartesian
            this.moveTo([
                spheCoord[0] * Math.sin(spheCoord[1]) * Math.cos(spheCoord[2]),
                spheCoord[0] * Math.sin(spheCoord[2]),
                spheCoord[0] * Math.cos(spheCoord[1]) * Math.cos(spheCoord[2])
            ]);
        }

        // Default placed at origin
        this.moveTo([0,0,0]);
    }

    function Camera(skyToControl) {
        inherit(this, Positioned);

        // Set perspective, we don't expect this to change
        var fovy = 50; // degrees
        var near = 0.01;
        var far = 500;

        this._radius = 130;
        this._elevation = 30; // Degrees
        this._angle = 0; // Degrees
        
        // Simplified lookAt that uses current position (from Positioned)
        // and default "up" of [0,1,0]
        this._center = [0,0,0];
        this._up = [0,1,0];

        this.recomputeAspectRatio = function(newWidth, newHeight) {
            gl.viewport(0,0, newWidth, newHeight);
            gl.transforms.projection.perspective(fovy, newWidth/newHeight, near, far);
        }
        this.recomputeAspectRatio(gl.width, gl.height);

        this.recomputeViewMatrix = function() {
            gl.transforms.view.lookAt(this._position, this._center, this._up);
            var vec = vec3.create();
            vec3.subtract(this._center, this._position, vec);
            skyToControl.setViewVector(vec);
        }

        this.lookAt = function(center, optional_up) {
            if(optional_up) this._up = optional_up;
            this._center = center;
            this.recomputeViewMatrix();
        }

        // Intercept moveTo so we can reset view matrix
        this.moveTo = function(newPosition) {
            this.__proto__.moveTo(newPosition);
            this.recomputeViewMatrix();
        }

        this.setPosition = function() {
            this.moveToSphereical([this._radius, toRad(this._angle),
                toRad(this._elevation)]);
        };

        // Mouse camera controls

        var ths = this;

        // Zoom in and out
        window.addEventListener("mousewheel", function(e) {
            ths._radius -= e.wheelDelta / 20.0;
            ths.setPosition();
        });

        // Drag to change the camera angle 
        var dragging = false;
        var lastX;
        var lastY;
        window.addEventListener("mousedown", function(e) {
            dragging = true;
            lastX = e.offsetX;
            lastY = e.offsetY;
        });

        window.addEventListener("mouseup", function(e) {
            dragging = false;
        });

        window.addEventListener("mousemove", function(e) {
            if(dragging) {
                var deltaX = lastX - e.offsetX;
                var deltaY = lastY - e.offsetY;
                ths._angle += deltaX/10;
                ths._elevation -= deltaY/10;
                ths.setPosition();
                lastX = e.offsetX;
                lastY = e.offsetY;
            }
        });

        this.setPosition();
    }

    function Planet() {
        inherit(this, Positioned);

        // Defined by individual planets
        this._texture = undefined;
        this._radius = 1;
        this._rotationalVelocity = 0; // Degrees per second
        this._orbitRadius = 0;
        this._orbitalRotationalVelocity = 0; // Degrees per second

        this._mesh = gl.Shapes.sphere;

        // Default planet shader
        this._shader = gl.ShaderFunction(function(mesh, mvpMat, modelMat, planetTex) {
            var worldPosition = (modelMat * vec4(mesh.pos, 1.0)).xyz;
            var planetCenter = (modelMat * vec4(0.0, 0.0, 0.0, 1.0)).xyz;

            var L = normalize(worldPosition);
            var N = normalize(worldPosition - planetCenter);

            gl_Position = mvpMat * vec4(mesh.pos, 1.0);
            with((L, N, texcoord = mesh.texcoord)) {
                var ambient = 0.15; 
                var texColor = texture2D(planetTex, texcoord).rgb;
                var rd = max(0.0, dot(-1.0 * L, N));

                gl_FragColor = vec4(texColor * (rd + ambient), 1.0);
            }
        });

        this._rotationalPositon = 0; // Degrees
        this._orbitPosition = 0; // Degrees
        this.update = function(dt) {
            this._rotationalPositon += this._rotationalVelocity * dt;
            this._orbitPosition += this._orbitalRotationalVelocity * dt;
            this.moveToSphereical([this._orbitRadius, toRad(this._orbitPosition), 0]);
        };

        this.setModelAndGo = function(callback) {
            gl.transforms.model.push();
            gl.transforms.model.translate(this._position);
            gl.transforms.model.scale([this._radius,this._radius,this._radius]);
            gl.transforms.model.rotate(toRad(this._rotationalPositon), [0,1,0]);
            callback();
            gl.transforms.model.pop();
        };

        this.draw = function() {
            var ths = this;
            this.setModelAndGo(function(){
                ths._shader(ths._mesh, gl.transforms.modelViewProjectionMatrix,
                    gl.transforms.modelMatrix, ths._texture);
            });
        };
    }

    function Sun() {
        inherit(this, Planet);
        this._texture = staticTexture("sun.jpg");
        this._radius = 10;
        this._rotationalVelocity = 5;

        this.shader = gl.ShaderFunction(function(mvpMat) {
            gl_Position = mvpMat * vec4(this._mesh.pos, 1.0);
            with((texcoord = this._mesh.texcoord)) {
                gl_FragColor = texture2D(this._texture, texcoord);
            }
        });

        this.draw = function() {
            var ths = this;
            this.setModelAndGo(function(){
                ths.shader(gl.transforms.modelViewProjectionMatrix);
            });
        }
    }

    function Moon() {
        inherit(this, Planet);
        this._texture = staticTexture("moon.jpg");
        this._radius = 0.3;
        this._rotationalVelocity = 2;
        this._orbitRadius = 2;
        this._orbitalRotationalVelocity = 2;
    }

    function Earth() {
        inherit(this, Planet);

        this._dayTexture = staticTexture("earth.jpg");
        this._nightTexture = staticTexture("earth-night.jpg");
        this._spectralTexture = staticTexture("earth-spectral.jpg");
        this._cloudTexture = staticTexture("earth-cloud.jpg");
        this._cloudAlpha = staticTexture("earth-cloud-alpha.jpg");
        this._radius = 3;
        this._rotationalVelocity = 16;

        this._cloudAngle = 0;
        this._cloudRotationalVelocity = 2;

        this._orbitRadius = 23;
        this._orbitalRotationalVelocity = 4;

        this._moon = new Moon();

        this._shader = gl.ShaderFunction(function(mvpMat, modelMat, cameraPos){
            var worldPosition = (modelMat * vec4(this._mesh.pos, 1.0)).xyz;
            var planetCenter = (modelMat * vec4(0.0, 0.0, 0.0, 1.0)).xyz;

            var L = normalize(worldPosition);
            var N = normalize(worldPosition - planetCenter);
            var V = normalize(worldPosition - cameraPos);
            var R = reflect(-1.0 * L, N);

            gl_Position = mvpMat * vec4(this._mesh.pos, 1.0);

            with((L, N, V, R, texcoord = this._mesh.texcoord)) {

                // Diffuse
                var rd = max(0.0, dot(-1.0 * L, N));
                var dayColor = texture2D(this._dayTexture, texcoord).rgb;
                var nightColor = texture2D(this._nightTexture, texcoord).xyz;
                var diffuse = (nightColor * (1.0 - rd)) +
                              (dayColor * rd);

                // Specular
                var rFactor = pow(max(0.0, dot(V, R)), 5.0);
                var specular = texture2D(this._spectralTexture, texcoord).xyz;
                specular = specular * rFactor * 0.3;

                var cloudShift = this._cloudAngle / 360.0;
                var cloudTexCoord = vec2(texcoord.x + cloudShift, texcoord.y);
                var cloudColor = texture2D(this._cloudTexture, cloudTexCoord).rgb;
                var cloudAlpha = texture2D(this._cloudAlpha, cloudTexCoord).r;
                var finalCloudColor = rd * (1.0 - cloudAlpha) * cloudColor;

                var finalSurfaceColor = (cloudAlpha) * (diffuse + specular);

                gl_FragColor = vec4(finalCloudColor + finalSurfaceColor, 1.0);
            }
        });

        this.update = function(dt) {
            this._rotationalPositon += this._rotationalVelocity * dt;
            this._orbitPosition += this._orbitalRotationalVelocity * dt;
            this.moveToSphereical([this._orbitRadius, toRad(this._orbitPosition), 0]);
            this._cloudAngle += this._cloudRotationalVelocity * dt;
            this._moon.update(dt);
        };

        this.draw = function() {
            var ths = this;
            this.setModelAndGo(function(){
                ths._shader(gl.transforms.modelViewProjectionMatrix,
                    gl.transforms.modelMatrix, camera._position);
                ths._moon.draw();
            });
        }
    }

    function Mars() {
        inherit(this, Planet);
        this._texture = staticTexture("mars.jpg");
        this._radius = 2;
        this._rotationalVelocity = 20;
        this._orbitRadius = 35;
        this._orbitalRotationalVelocity = 3;
    }

    function Jupiter() {
        inherit(this, Planet);
        this._texture = staticTexture("jupiter.jpg");
        this._radius = 6;
        this._rotationalVelocity = 11;
        this._orbitRadius = 55;
        this._orbitalRotationalVelocity = 2;
    }

    function MakeRingMesh() {
        var mesh = {indices:[], vertices:[], normals:[]};

        //Add rings to mesh
        var innerRad = 1.2;
        var outerRad = 1.9;
        var step = 5.0 * Math.PI / 180.0;
        var startIndex = mesh.vertices.length;

        mesh.vertices.push(innerRad * Math.sin(0.0), 0.0,
                innerRad * Math.cos(0.0));
        mesh.vertices.push(outerRad * Math.sin(0.0), 0.0,
                outerRad * Math.cos(0.0));
        var currentIndex = startIndex + 1;
        for(var angle = step; angle < Math.PI * 2; angle += step) {
           mesh.vertices.push(innerRad * Math.sin(angle), 0.0,
                              innerRad * Math.cos(angle));
           mesh.vertices.push(outerRad * Math.sin(angle), 0.0,
                              outerRad * Math.cos(angle));

            mesh.indices.push(currentIndex, currentIndex+1, currentIndex+2);
            mesh.normals.push(0.0, 1.0, 0.0);
            mesh.indices.push(currentIndex+1, currentIndex+2, currentIndex+3);
            mesh.normals.push(0.0, 1.0, 0.0);
            currentIndex += 2;
        }
        mesh.vertices.push(innerRad * Math.sin(0.0), 0.0,
            innerRad * Math.cos(0.0));
        mesh.vertices.push(outerRad * Math.sin(0.0), 0.0,
            outerRad * Math.cos(0.0));
        mesh.indices.push(currentIndex, currentIndex+1, currentIndex+2);
        mesh.vertices.push(innerRad * Math.sin(step), 0.0,
            innerRad * Math.cos(step));
        mesh.indices.push(currentIndex+1, currentIndex+2, currentIndex+3);

        return {
            pos: new gl.Attribute('vec3', mesh.vertices),
            normal: new gl.Attribute('vec3', mesh.normals),
            index: new gl.IndexArray(mesh.indices)
        }; 
    }

    function Saturn() {
        inherit(this, Planet);
        this._texture = staticTexture("saturn.jpg");
        this._radius = 4;
        this._rotationalVelocity = 12;
        this._orbitRadius = 80;
        this._orbitalRotationalVelocity = 1.5;

        this._ringMesh = MakeRingMesh();
        this._ringTexture = staticTexture("saturn-ring.jpg");
        this._ringAlpha = staticTexture("saturn-ring-alpha.gif");

        this._ringShader = gl.ShaderFunction(function(
            mesh, mvpMat, text, alpha
        ){
            var distanceFromCenter = length(mesh.pos);
            distanceFromCenter = 1.0 - (distanceFromCenter - 1.1) / 0.8;

            gl_Position = mvpMat * vec4(mesh.pos, 1.0);

            with((distanceFromCenter)) {
                var ringColor = texture2D(text, vec2(distanceFromCenter, 0.5)).rgb;
                var ringAlpha = texture2D(alpha, vec2(distanceFromCenter, 0.5)).r;
                gl_FragColor = vec4(ringColor, ringAlpha);
            }
        });

        this.draw = function() {
            // Draw rings
            var ths = this;
            this.setModelAndGo(function(){
                ths._shader(ths._mesh, gl.transforms.modelViewProjectionMatrix,
                    gl.transforms.modelMatrix, ths._texture);

                gl.enable(gl.BLEND);
                gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
                ths._ringShader(ths._ringMesh,
                    gl.transforms.modelViewProjectionMatrix,
                    ths._ringTexture, ths._ringAlpha);
                gl.disable(gl.BLEND);
            });
        }
    }

    function Neptune() {
        inherit(this, Planet);
        this._texture = staticTexture("neptune.jpg");
        this._radius = 3;
        this._rotationalVelocity = 8;
        this._orbitRadius = 110;
        this._orbitalRotationalVelocity = 1;

    }

    function ShadowMap() {
        this._perspective = mat4.create();
        this._fb = new gl.FrameBuffer();
        mat4.perspective(toRad(360), 1.0, 0.01, 500, this._perspective);

        // Extremely simple. Just for depth info
        this._shader = gl.ShaderFunction(function(mesh, pMat, mMat){
            gl_Position = mMat * pMat * vec4(mesh.pos, 1.0);
            var none = 0.0;
            with((none)) {
                gl_FragColor = vec4(1.0);
            }
        });

        var a = 0;
        this.update = function() {
            /*
            this._fb.bind();
            for(var i = 1; i < objects.length; i++) {
                var obj = objects[i];
                var ths = this;
                obj.setModelAndGo(function(){
                    ths._shader(obj._mesh, ths._perspective,
                        gl.transforms.modelMatrix);
                });
            }
            */

            this._fb.unbind();

            /*
            if(!a) {
                shadowTexture = this._fb.getDepthTexture();
                var img = gl.ImageFromTexture(shadowTexture);
                document.body.appendChild(img);
                a = 1;
            }
            */
        };
    }

    // Run Demo
    
    gl = jsl_init(canvas, GL_OPTIONS);
    var sun = new Sun();
    var objects = [
        new Earth(),
        new Mars(),
        new Jupiter(), 
        new Saturn(),
        new Neptune(),
    ];
    var sky = new Sky();
    var camera = new Camera(sky);

    function onWindowResize() {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
        gl.width = canvas.width;
        gl.height = canvas.height;
        camera.recomputeAspectRatio(canvas.width,canvas.height);
    }
    window.onresize = onWindowResize;
    onWindowResize();

    window.addEventListener("dblclick", function(e) {
        // Determine the planet that was clicked on
        
        var clickPoint = [e.offsetX, e.offsetY];

        var mvMat = gl.transforms.viewProjectionMatrix;

        function project(point) {
            // Normalized device coordinates
            var projected = [0,0,0,0];
            mat4.multiplyVec4(mvMat, point, projected);
            projected = [projected[0]/projected[3],
                         projected[1]/projected[3],
                         projected[2]/projected[3]];

            // Screen coordinates
            projected = [(projected[0] + 1)/2 * gl.width,
                         (projected[1] + 1)/2 * gl.height,
                         (projected[2])];

            return projected;
        }

        var objectHit = null;
        var hitObjectZ = 0;
        for(var i in objects) {
            var object = objects[i];
            var objectCenter = object._position;
            var objectRadius = object._radius;


            var objectCenterPoint = [objectCenter[0],
                                     objectCenter[1],
                                     objectCenter[2],
                                     1.0];

            var objectSurfacePoint = [objectCenter[0] + objectRadius,
                                      objectCenter[1],
                                      objectCenter[2],
                                      1.0];

            var centerPointScreen = project(objectCenterPoint);
            var surfacePointScreen = project(objectSurfacePoint);

            var radialVector = [0,0,0];
            vec3.subtract(surfacePointScreen, centerPointScreen, radialVector);
            var screenRadius = vec3.length(radialVector);
            console.log(screenRadius);

            var centerPoint = [centerPointScreen[0], centerPointScreen[1]];
            console.log(centerPoint);
            console.log(clickPoint);

            // Test the point against the circle
            var toClickVec = [clickPoint[0] - centerPoint[0],
                              clickPoint[1] - centerPoint[1]];
            var distance = Math.sqrt(Math.pow(toClickVec[0], 2) +
                                     Math.pow(toClickVec[1], 2));

            if((distance < screenRadius) &&
               ((!objectHit) || (centerPointScreen[2] < hitObjectZ))
            ) {
                objectHit = object;
                hitObjectZ = centerPointScreen[2];
            }
        }
        
        console.log(objectHit);
    });

    var shadowMap = new ShadowMap();

    gl.loop(function(dt){
        sky.draw();
        sun.update(dt);
        for(var i in objects) {
            objects[i].update(dt);
        }

        shadowMap.update();

        sun.draw();
        for(var i in objects) {
            objects[i].draw();
        }
    });
}
