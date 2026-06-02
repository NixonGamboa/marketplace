import '@testing-library/jest-dom'
// Polyfill para scrollIntoView en entorno jsdom
if (!Element.prototype.scrollIntoView) {
	// eslint-disable-next-line @typescript-eslint/no-empty-function
	Element.prototype.scrollIntoView = function () {}
}
