
import { Promise } from 'es6-promise-min';
import postRobot from 'post-robot/dist/post-robot';
import { noop, once, extend, getParentWindow } from '../util';
import { CONSTANTS } from '../constants';

export class ChildComponent {

    constructor(component, options = {}) {
        this.validate(options);

        this.component = component;

        this.onEnter = once(options.onEnter || noop);
        this.onExit = once(options.onExit || noop);
        this.onClose = once(options.onClose || noop);
        this.onError = once(options.onError || noop);

        this.onProps = options.onProps || noop;

        this.props = {};

        this.parentWindow = this.parentComponentWindow = getParentWindow();

        if (!this.parentWindow) {
            throw new Error(`[${this.component.tag}] Can not find parent window`);
        }

        this.init(this.parentWindow);
    }

    init(win) {
        this.initPromise = postRobot.send(win, CONSTANTS.POST_MESSAGE.INIT).then(data => {

            if (data.parentId && this.parentWindow && this.parentWindow.frames[data.parentId]) {
                this.parentComponentWindow = this.parentWindow.frames[data.parentId];

                if (win !== this.parentComponentWindow) {
                    return this.init(this.parentComponentWindow);
                }
            }

            this.listen();

            this.parentComponentWindow = win;

            this.context = data.context;
            extend(this.props, data.props);

            this.onEnter.call(this);
            this.onProps.call(this);

        }).catch(err => this.onError(err));
    }

    validate(options) {
        // pass
    }

    parentListeners() {
        return {
            [ CONSTANTS.POST_MESSAGE.PROPS ](source, data) {
                extend(this.props, data.props);
                this.onProps.call(this);
            },

            [ CONSTANTS.POST_MESSAGE.CLOSE ](source, data) {
                return this.close();
            },

            [ CONSTANTS.POST_MESSAGE.RESIZE ](source, data) {
                window.resizeTo(data.width, data.height);
            }
        };
    }

    listen() {
        if (!this.parentComponentWindow) {
            throw new Error(`[${this.component.tag}] parent component window not set`);
        }

        let parentListeners = this.parentListeners();

        for (let listenerName of Object.keys(parentListeners)) {
            postRobot.on(listenerName, { window: this.parentComponentWindow }, (source, data) => {
                return parentListeners[listenerName].call(this, source, data);
            });
        }
    }

    close() {
        this.onClose.call(this);
        return postRobot.sendToParent(CONSTANTS.POST_MESSAGE.CLOSE);
    }

    focus() {
        window.focus();
    }

    resize(height, width) {
        return Promise.resolve().then(() => {

            if (this.context === CONSTANTS.CONTEXT.POPUP) {
                window.resizeTo(width, height);

            } else if (this.context === CONSTANTS.CONTEXT.IFRAME) {
                return postRobot.sendToParent(CONSTANTS.POST_MESSAGE.RESIZE, {
                    height,
                    width
                });
            }
        });
    }

    redirectParent(url) {

        function redirect() {
            setTimeout(() => {
                if (window.opener) {
                    window.opener.location = url;
                } else if (window.parent) {
                    window.parent.location = url;
                }
            });
        }

        return postRobot.sendToParent(CONSTANTS.POST_MESSAGE.REDIRECT, {
            url
        }).then(function() {
            console.warn(`[${this.component.tag}] Parent did not redirect`);
            redirect();
        }, function(err) {
            console.warn(`[${this.component.tag}] Parent did not redirect due to error: ${err.stack || err.toString()}`);
            redirect();
        });
    }
}