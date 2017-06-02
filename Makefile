DIST = dist

all: compress gen_dir

compress:
	rm -f $(DIST).zip
	zip $(DIST).zip content-persistent.js \
		images/icon_128.png images/icon_48.png images/icon_16.png \
		manifest.json

gen_dir:
	rm -rf $(DIST)
	unzip $(DIST).zip -d $(DIST)
