VERSION = $(shell grep '"Version":' ./package/metadata.json | grep -o '[0-9\.]*')

.PHONY: *

build: lint test
	pnpm exec tsc -p ./src/main --outFile ./package/contents/code/main.js
	mkdir -p ./package/contents/config
	./run-ts.sh ./src/generators/config > ./package/contents/config/main.xml

npm-install:
	pnpm install --ignore-scripts

lint: npm-install
	pnpm exec eslint ./src

lint-fix: npm-install
	pnpm exec eslint ./src --fix

test:
	./run-ts.sh ./src/tests "${PATTERN}"

install: build
	if kpackagetool6 --type=KWin/Script --show=karousel >/dev/null 2>&1; then \
		kpackagetool6 --type=KWin/Script --upgrade=./package; \
	else \
		kpackagetool6 --type=KWin/Script --install=./package; \
	fi

uninstall:
	kpackagetool6 --type=KWin/Script --remove=karousel

package: build
	tar -czf ./karousel_${subst .,_,${VERSION}}.tar.gz ./package --transform s/package/karousel/

docs-key-bindings-bbcode:
	@./run-ts.sh ./src/generators/docs/keyBindingsBbcode

docs-key-bindings-markdown:
	@./run-ts.sh ./src/generators/docs/keyBindingsMarkdown

docs-key-bindings-fmt:
	@./run-ts.sh ./src/generators/docs/keyBindingsFmt
