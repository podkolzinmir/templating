'use strict';

import {use, inject} from 'di/testing';
import {Injector, Inject, Provide} from 'di';
import {ViewPort, View, RootView} from '../src/view';
import {ViewFactory, BoundViewFactory} from '../src/view_factory';
import {$, $html} from './dom_mocks';
import {AnnotationProvider} from '../src/annotation_provider';
import {DecoratorDirective, TemplateDirective, ComponentDirective, EXECUTION_CONTEXT} from '../src/annotations';
import {EventHandler} from '../src/event_handler';
import {$, $html} from './dom_mocks';
import {NgNode} from '../src/ng_node';

describe('ViewFactory', () => {
  describe('create root or child view', ()=>{
    var viewFactory, injector;

    beforeEach(()=>{
      inject(Injector, ViewFactory, (_injector, _viewFactory)=>{
        injector = _injector;
        viewFactory = _viewFactory;
        spyOn(viewFactory, '_bindElement').and.callFake(function(binder, injector) {
          return binder.childInjector = injector.createChild();
        });
        spyOn(viewFactory, '_bindNonElement').and.callFake(function(binder, injector) {
          return binder.childInjector = injector.createChild();
        });
      });
    });

    function createBinders(levels) {
      var binders = [];
      for (var i=0; i<levels.length; i++) {
        binders.push({
          level: levels[i],
          nonElementBinders: [],
          component: null,
          decorators: [],
          attrs: {
            init: {},
            bind: {},
            event: {}
          }
        });
      }
      return binders;
    }

    function createNonElementBinders(indicesInParent) {
      var binders = [];
      for (var i=0; i<indicesInParent.length; i++) {
        binders.push({
          indexInParent: indicesInParent[i],
          template: null,
          attrs: {
            init: {},
            bind: {},
            event: {}
          }
        });
      }
      return binders;
    }

    it('should not clone the given nodes for root views', () => {
      var container = $('<div>a<a></a></div>')[0];
      var view = viewFactory.createRootView({
        template: {
          container: container,
          binders: []
        }
      });
      expect(Array.prototype.slice.call(container.childNodes)).toEqual(view.nodes);
    });

    it('should clone the given nodes for child views', () => {
      var rootView = viewFactory.createRootView({
        template: {
          container: $('<div></div>')[0],
          binders: []
        }
      });
      var container = $('<div>a<a></a></div>')[0];
      var view = viewFactory.createChildView({
        parentView: rootView,
        template: {
          container: container,
          binders: []
        }
      });
      expect(Array.prototype.slice.call(container.childNodes)).not.toEqual(view.nodes);
      expect($html(container.childNodes)).toBe($html(view.nodes));
    });

    it('should not reparent the given nodes', ()=>{
      var container = $('<div>a</div>')[0]
      var node = container.childNodes[0];
      viewFactory.createRootView({
        template: {
          container: container,
          binders: []
        }
      });
      expect(node.parentNode).toBe(container);
    });

    it('should create a child injector and provide the view on the new injector', ()=>{
      var view = viewFactory.createRootView({
        template: {
          container: $('<div>a</div>')[0],
          binders: []
        }
      });
      expect(view.injector.parent).toBe(injector);
      expect(view.injector.get(View)).toBe(view);
    });

    it('should save the executionContext on the view', ()=>{
      var execContext = {};
      var view = viewFactory.createRootView({
        template: {
          container: $('<div>a</div>')[0],
          binders: []
        },
        executionContext: execContext
      });
      expect(view.executionContext).toBe(execContext);
    });

    it('should use the parentViews executionContext by default', ()=>{
      var execContext = {};
      var rootView = viewFactory.createRootView({
        template: {
          container: $('<div></div>')[0],
          binders: []
        },
        executionContext: execContext
      });
      var view = viewFactory.createChildView({
        parentView: rootView,
        template: {
          container: $('<div>a</div>')[0],
          binders: []
        }
      });
      expect(view.executionContext).toBe(execContext);
    });

    it('should save the parentView in the view', ()=>{
      var rootView = viewFactory.createRootView({
        template: {
          container: $('<div></div>')[0],
          binders: []
        }
      });
      var childView = viewFactory.createChildView({
        parentView: rootView,
        template: {
          container: $('<div></div>')[0],
          binders: []
        }
      });
      expect(childView.parentView).toBe(rootView);
    });

    it('should only use the NonElementBinders of the root element binder', ()=>{
      var binders = createBinders([0]);
      var nonElBinders = binders[0].nonElementBinders = createNonElementBinders([0,2]);
      var view = viewFactory.createRootView({
        template: {
          container: $('<div>a<a></a>b</div>')[0],
          binders: binders
        }
      });

      expect(viewFactory._bindElement).not.toHaveBeenCalled();
      var calls = viewFactory._bindNonElement.calls;
      expect(calls.argsFor(0)).toEqual([nonElBinders[0], view.injector, view.nodes[0]]);
      expect(calls.argsFor(1)).toEqual([nonElBinders[1], view.injector, view.nodes[2]]);
    });

    it('should use the second and further binders with the elements that have the css class "ng-binder"', ()=>{
      var binders = createBinders([0,1]);
      var view = viewFactory.createRootView({
        template: {
          container: $('<div><a></a><b class="ng-binder"></b></div>')[0],
          binders: binders
        }
      });
      var calls = viewFactory._bindElement.calls;
      expect(calls.count()).toBe(1);
      expect(calls.argsFor(0)[2]).toBe(view.nodes[1]);
    });

    it('should pass the injector that is returned by a binder to its children', () => {
      var binders = createBinders([0,1,2,1]);
      var view = viewFactory.createRootView({
        template: {
          container: $('<div><a class="ng-binder"><b class="ng-binder"></b></a><a class="ng-binder"></div>')[0],
          binders: binders
        }
      });

      var calls = viewFactory._bindElement.calls;
      expect(calls.argsFor(0)[1]).toBe(view.injector);
      expect(calls.argsFor(1)[1].parent).toBe(view.injector);
      expect(calls.argsFor(2)[1]).toBe(view.injector);
    });

    it('should use NonElementBinders of non root element binders', () => {
      var binders = createBinders([0,1]);
      var nonElBinders = binders[1].nonElementBinders = createNonElementBinders([0]);
      var view = viewFactory.createRootView({
        template: {
          container: $('<div><a class="ng-binder">c</a></div>')[0],
          binders: binders
        }
      });

      var calls = viewFactory._bindNonElement.calls;
      expect(calls.count()).toBe(1);
      expect(calls.argsFor(0)).toEqual([nonElBinders[0], binders[1].childInjector, view.nodes[0].childNodes[0]]);
    });

  });

  describe('bind nodes', ()=>{
    var injector, binder, view, viewFactory;

    function createInjector(context = {}) {
      @Provide(View)
      function viewProvider(injector:Injector) {
        return new RootView(document.createElement('a'), injector, context);
      }

      use(viewProvider);

      inject(ViewFactory, Injector, View, (_viewFactory, _injector, _view)=>{
        viewFactory = _viewFactory;
        spyOn(viewFactory, 'createChildView').and.callThrough();
        spyOn(viewFactory, 'createRootView').and.callThrough();
        view = _view;
        injector = _injector;
      })
    }

    describe('_bindNodeBasic', ()=>{
      var node, childInjector;

      function init({attrs = null, directives = [], diProviders = [], context = {}}) {
        createInjector(context);
        attrs = attrs || {};
        attrs.init = attrs.init || {};
        attrs.bind = attrs.bind || {};
        attrs.event = attrs.event || {};

        binder = {attrs: attrs};
        node = $('<div></div>')[0];
        childInjector = viewFactory._bindNodeBasic({binder, injector, node, diProviders, directiveClasses:directives});
      }

      it('should create a child injector', ()=>{
        init({});
        expect(childInjector.parent).toBe(injector);
      });

      it('should provide the ngNode via DI', () => {
        init({});
        expect(childInjector.get(NgNode).nativeNode).toBe(node);
      });

      it('should save the injector and the directive instances on the ngNode', ()=>{
        @DecoratorDirective()
        class SomeDirective {
        }

        init({
          directives: [SomeDirective]
        });

        var ngNode = node.ngNode;
        expect(ngNode.data.injector).toBe(childInjector);
        expect(ngNode.data.directives).toEqual([childInjector.get(SomeDirective)]);
      });

      describe('observe in directive annotation', ()=>{

        it('should call the method when the expression changed', ()=>{
          var receivedProp;
          @DecoratorDirective({ observe: {'someProp+"Test"': 'somePropChanged' }})
          class SomeDirective {
            somePropChanged(value) {
              receivedProp = value;
            }
          }
          init({
            directives: [SomeDirective]
          });

          var directiveInstance = childInjector.get(SomeDirective);
          directiveInstance.someProp = '1';
          view.digest();
          expect(receivedProp).toBe('1Test');
          directiveInstance.someProp = '2';
          view.digest();
          expect(receivedProp).toBe('2Test');
        });

      });

      describe('bind in directive annotation', ()=>{
        var directiveInstance;

        @DecoratorDirective({bind: {'someNodeProp': 'dir.someProp'}})
        class SomeDirective {
          constructor() {
            this.dir = {};
          }
        }

        it('should update the directive when the node changes', ()=>{
          init({
            directives: [SomeDirective]
          });
          directiveInstance = childInjector.get(SomeDirective);

          node.ngNode.someNodeProp = 'someValue';
          expect(directiveInstance.dir.someProp).toBe('someValue');
        });

        it('should update the node when the directive changes', ()=>{
          init({
            directives: [SomeDirective]
          });
          directiveInstance = childInjector.get(SomeDirective);

          directiveInstance.dir.someProp = 'someValue';
          view.digest();
          expect(node.ngNode.someNodeProp).toBe('someValue');
        });

        it('should initialize observed nodes with the attribute value', ()=>{
          init({
            directives: [SomeDirective],
            attrs: {
              init: {
                'someNodeProp': 'someValue'
              }
            }
          });
          directiveInstance = childInjector.get(SomeDirective);

          expect(directiveInstance.dir.someProp).toBe('someValue');
          expect(node.ngNode.someNodeProp).toBe('someValue');
        });

      });

      describe('data binding', () => {

        it('should update the ngNode when the expression changes', ()=>{
          init({
            attrs: {
              bind: { 'someNodeProp': 'someCtxProp' }
            }
          });

          view.executionContext.someCtxProp = 'someValue';
          view.digest();
          expect(node.ngNode.someNodeProp).toBe('someValue');
          expect(view.executionContext.someCtxProp).toBe('someValue');
        });

        it('should update the expression when ngNode changes', ()=>{
          init({
            attrs: {
              bind: { 'someNodeProp': 'someCtxProp' }
            }
          });
          node.ngNode.someNodeProp = 'someValue';

          expect(node.ngNode.someNodeProp).toBe('someValue');
          expect(view.executionContext.someCtxProp).toBe('someValue');
        });

        it('should initialize the ngNode from the execution context', ()=>{
          init({
            attrs: {
              bind: {
                'someNodeProp': 'someCtxProp'
              },
              init: {
                'someNodeProp': 'someNodeInitValue'
              }
            },
            context: { someCtxProp: 'someExecInitValue' }
          });

          expect(node.ngNode.someNodeProp).toBe('someExecInitValue');
          expect(view.executionContext.someCtxProp).toBe('someExecInitValue');
        });
      });

      it('should initialize event handling', ()=>{
        spyOn(EventHandler.prototype, 'listen');
        init({
          attrs: {
            event: { 'click': 'someExpr' }
          }
        })
        expect(EventHandler.prototype.listen).toHaveBeenCalledWith(node, 'click', 'someExpr');

      });

    });

    describe('bindElement', ()=>{
      var element, childInjector;

      function init({decorators = [], component = null, context = {}, innerHTML = ''}) {
        binder = {
          attrs: {
            bind: {},
            init: {},
            event: {}
          },
          decorators: decorators,
          component: component,
          nonElementBinders: [],
          level: -1
        };
        element = $('<div></div>')[0];
        element.innerHTML = innerHTML;
        element.shadowRoot = document.createElement('div');
        element.createShadowRoot = jasmine.createSpy('createShadowRoot').and.returnValue(element.shadowRoot);
        createInjector(context);
        childInjector = viewFactory._bindElement(binder, injector, element);
      }

      function createElementAndBinder(binderData) {
        binder = new ElementBinder(binderData);
        element = $('<div></div>')[0];
        element.shadowRoot = document.createElement('div');
        element.createShadowRoot = jasmine.createSpy('createShadowRoot').and.returnValue(element.shadowRoot);
      }

      describe('decorator directives', ()=>{

        it('should create a new directive instance', () => {
          var createdInstance;
          @DecoratorDirective()
          class SomeDirective {
            constructor() {
              createdInstance = this;
            }
          }
          init({
            decorators: [
              SomeDirective
            ]
          });

          expect(createdInstance).toBeTruthy();
        });
      });

      describe('component directives', ()=>{
        var createdInstance,
           container,
           compiledTemplate,
           templatePromise,
           SomeDirective;

        beforeEach(()=>{
          container = $('<div>a</div>')[0];
          compiledTemplate = {
            container: container,
            binders: []
          };
          templatePromise = {
            then: function(callback) {
              callback({
                template: compiledTemplate
              });
            }
          };

          @ComponentDirective({template: templatePromise})
          class SomeDirective_ {
            constructor() {
              createdInstance = this;
            }
          }
          SomeDirective = SomeDirective_;
        });

        it('should create a new directive instance', () => {
          init({
            component: SomeDirective
          });

          expect(createdInstance).toBeTruthy();
        });

        it('should append the template to the ShadowDOM', () => {
          var contentHtml = '<span id="outer"></span>';
          init({
            component: SomeDirective,
            innerHTML: contentHtml
          });

          expect(element.shadowRoot.innerHTML).toBe($html(container.childNodes));
          expect(element.innerHTML).toBe(contentHtml);
        });

        it('should create a new View with the component instance as execution context', () => {
          init({
            component: SomeDirective
          });
          var args = viewFactory.createChildView.calls.argsFor(0)[0];
          expect(viewFactory.createChildView).toHaveBeenCalledWith({
            parentView: view,
            executionContext: childInjector.get(SomeDirective),
            template: compiledTemplate
          });
        });

        // TODO: Error case (reject of templatePromise): log the error via the logger
        // TODO: Which logger to use?

      });

    });

    describe('initNonElement', () => {
      var node, compiledTemplate, createdInstance, childInjector;

      function init({template = null}) {
        node = document.createComment('comment');
        binder = {
          template: template,
          attrs: {
            init: {},
            bind: {},
            event: {}
          },
          indexInParent: -1
        };
        createInjector();
        inject(ViewFactory, (viewFactory)=>{
          childInjector = viewFactory._bindNonElement(binder, injector, node);
        });
      }

      beforeEach(()=>{
        compiledTemplate = {
          container: $('<div>a</div>')[0],
          binders: []
        };
      });

      @TemplateDirective
      class SomeDirective {
        constructor() {
          createdInstance = this;
        }
      }

      function createCommentAndNonElementBinder(data) {
        node = document.createComment('comment');
        binder = new NonElementBinder(data);
      }

      describe('tempate directives', () => {
        it('should create a new directive instance', () => {
          init({
            template: {
              directive: SomeDirective,
              compiledTemplate: compiledTemplate
            }
          });

          expect(createdInstance).toBeTruthy();
        });

        it('should provide the BoundViewFactory and ViewPort via DI', () => {
          init({
            template: {
              directive: SomeDirective,
              compiledTemplate: compiledTemplate
            }
          });

          expect(childInjector.get(ViewPort)).toEqual(new ViewPort(node));
          var boundViewFactory = childInjector.get(BoundViewFactory);
          expect(boundViewFactory.viewFactory).toBe(viewFactory);
          expect(boundViewFactory.template).toBe(compiledTemplate);
        });
      });
    });

  });
});
