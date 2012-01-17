
solarDemo: solarsystem.html
	python -m SimpleHTTPServer &
	chromium-browser localhost:8000/solarsystem.html
