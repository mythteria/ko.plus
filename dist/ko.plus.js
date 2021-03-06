/*=============================================================================
 *   Author:      Steve Greatrex - @stevegreatrex                               
 *                                                                              
 *   Description: Awesome extensions for KnockoutJs                              
 *=============================================================================*/

(function (window, undefined) {
    "use strict";
    (function (factory) {
        if (typeof define === "function" && define.amd) { // AMD
            define("ko.plus", ["jquery", "knockout"], factory);
        }
        else {
            factory(window.jQuery, window.ko);
        }
    }(function ($, ko) {
	"use strict";;/*global jQuery:false, ko:false*/

/**
* Creates a new instance of ko.command
*
* @constructor
* @param  options The options object for the command or a commmand function
* @return A new instance of ko.command
*/
ko.command = function (options) {
	//allow just a function to be passed in
	if (typeof options === "function") { options = { action: options }; }

	//check an action was specified
	if (!options) { throw "No options were specified"; }
	if (!options.action) { throw "No action was specified in the options"; }

	var

	//flag to indicate that the operation is running
	isRunning = ko.observable(false),

	//flag to indicate that the operation failed when last executed
	failed = ko.observable(),
	failMessage = ko.observable(""),
	completed = ko.observable(false),

	//record callbacks
	callbacks = {
		done: [],
		fail: [function () { failed(true); }],
		always: [function () { isRunning(false); }]
	},

	//execute function (and return object
	execute = function () {
		//check if we are able to execute
		if (!canExecuteWrapper.call(options.context || this)) {
			//dont attach any global handlers
			return instantDeferred(false, null, options.context || this).promise();
		}

		//notify that we are running and clear any existing error message
		isRunning(true);
		failed(false);
		failMessage("");

		//try to invoke the action and get a reference to the deferred object
		var promise;
		try {
			promise = options.action.apply(options.context || this, arguments);

			//if the returned result is *not* a promise, create a new one that is already resolved
			if (!promise || !promise.done || !promise.always || !promise.fail) {
				promise = instantDeferred(true, promise, options.context || this).promise();
			}

		} catch (error) {
			promise = instantDeferred(false, error, options.context || this).promise();
		}

		//set up our callbacks
		promise
			.always(callbacks.always, function () { completed(true); })
			.fail(callbacks.fail)
			.done(callbacks.done);

		return promise;
	},

	//canExecute flag
	forceRefreshCanExecute = ko.observable(), //note, this is to allow us to force a re-evaluation of the computed canExecute observable
	canExecuteWrapper = options.canExecute || function () { return true; },
	canExecute = ko.computed({
		deferEvaluation: true,
		read: function () {
			forceRefreshCanExecute(); //just get the value so that we register canExecute with forceRefreshCanExecute
			return !isRunning() && canExecuteWrapper.call(options.context || this);
		}
	}, options.context || this),

	//invalidate canExecute
	canExecuteHasMutated = function () {
		forceRefreshCanExecute.notifySubscribers();
	},

	//function used to append done callbacks
	done = function (callback) {
		callbacks.done.push(callback);
		return execute;
	},
	//function used to append failure callbacks
	fail = function (callback) {
		callbacks.fail.push(function () {
			var result = callback.apply(this, arguments);
			if (result) {
				failMessage(result);
			}
		});
		return execute;
	},
	//function used to append always callbacks
	always = function (callback) {
		callbacks.always.push(callback);
		return execute;
	},
	then = function(resolve, reject) {
		if (resolve) { callbacks.done.push(resolve); }
		if (reject) { callbacks.fail.push(reject); }

		return execute;
	};

	//attach the done and fail handlers on the options if specified
	if (options.done) { callbacks.done.push(options.done); }
	if (options.fail) { callbacks.fail.push(options.fail); }

	//public properties
	execute.isRunning = isRunning;
	execute.canExecute = canExecute;
	execute.canExecuteHasMutated = canExecuteHasMutated;
	execute.done = done;
	execute.fail = fail;
	execute.then = then;
	execute.failMessage = failMessage;
	execute.always = always;
	execute.failed = failed;
	execute.completed = completed;

	return execute;
};

/**
* Performs the following bindings on the valueAccessor command:
* - loadingWhen: command.isRunning
* - click: command
* - enable: command.canExecute
*/
ko.bindingHandlers.command = {
	init: function (element, valueAccessor, allBindingsAccessor, viewModel, bindingContext) {
		var command = ko.unwrap(valueAccessor());
		ko.bindingHandlers.loadingWhen.init.call(this, element, command.isRunning, allBindingsAccessor);
		ko.bindingHandlers.click.init.call(this, element, ko.observable(command), allBindingsAccessor, viewModel, bindingContext);
	},
	update: function (element, valueAccessor, allBindingsAccessor) {
		var command = ko.unwrap(valueAccessor());
		ko.bindingHandlers.loadingWhen.update.call(this, element, command.isRunning, allBindingsAccessor);
		ko.bindingHandlers.enable.update.call(this, element, command.canExecute, allBindingsAccessor);
	}
};
    
//factory method to create a $.Deferred that is already completed
function instantDeferred(resolve, returnValue, context) {
	var deferred = $.Deferred();
	if (resolve) {
		deferred.resolveWith(context, [returnValue]);
	} else {
		deferred.rejectWith(context, [returnValue]);
	}

	return deferred;
}
;/*global ko:false*/

function toEditable(observable, getRollbackValue) {
	var rollbackValues = [],
		cancelledValue;

	getRollbackValue = getRollbackValue || function (observable) { return observable(); };

	//a flag to indicate if the field is being edited
	observable.isEditing = ko.observable(false);

	//start an edit
	observable.beginEdit = function () {
		if (observable.isEditing()) { return; }
		cancelledValue = undefined;

		rollbackValues.push(getRollbackValue(observable));

		observable.isEditing(true);
	};

	//end (commit) an edit
	observable.endEdit = function () {
		if (!observable.isEditing()) { return; }

		observable.isEditing(false);
	};

	//cancel and roll-back an edit
	observable.cancelEdit = function () {
		if (!observable.isEditing() || !rollbackValues.length) { return; }

		cancelledValue = getRollbackValue(observable);

		observable(rollbackValues.pop());

		observable.isEditing(false);
	};

	//undo a set of cancelled changes
	observable.undoCancel = function () {
		if (cancelledValue === undefined) { return; }

		var value = cancelledValue; //grab value here as beginEdit will clear it
		observable.beginEdit();
		observable(value);
		cancelledValue = undefined;
	};

	//roll-back to historical committed values
	observable.rollback = function () {
		if (rollbackValues.length) {
			cancelledValue = undefined;
			observable(rollbackValues.pop());
		}
	};

	return observable;
}

ko.editable = function (initial) {
	return toEditable(ko.observable(initial));
};

ko.editableArray = function (initial) {
	return toEditable(ko.observableArray(initial || []), function (observable) {
		return observable.slice();
	});
};

var forEachEditableProperty = function (target, action) {
	for (var prop in target) {
		if (target.hasOwnProperty(prop)) {
			var value = target[prop];

			//direct editables
			if (value && value.isEditing) {
				action(value);
			}

			var unwrappedValue = ko.unwrap(value);

			//editables in arrays
			if (unwrappedValue && unwrappedValue.length) {
				for (var i = 0; i < unwrappedValue.length; i++) {
					if (unwrappedValue[i] && unwrappedValue[i].isEditing) {
						action(unwrappedValue[i]);
					}
				}
			}
		}
	}
};

ko.editable.makeEditable = function (target) {
	if (!target) {
		throw "Target must be specified";
	}

	target.isEditing = ko.observable(false);

	target.beginEdit = function () {
		if (!target.isEditable || target.isEditable()) {
			forEachEditableProperty(target, function (prop) { prop.beginEdit(); });
			target.isEditing(true);
		}
	};

	target.endEdit = function () {
		forEachEditableProperty(target, function (prop) { prop.endEdit(); });
		target.isEditing(false);
	};

	target.cancelEdit = function () {
		forEachEditableProperty(target, function (prop) { prop.cancelEdit(); });
		target.isEditing(false);
	};

	target.rollback = function () {
		forEachEditableProperty(target, function (prop) { prop.rollback(); });
	};

	target.undoCancel = function () {
		forEachEditableProperty(target, function (prop) { prop.undoCancel(); });
		target.beginEdit();
	};
};

ko.extenders.editable = function(observable) {
	return toEditable(observable);
};;/*global jQuery:false, ko:false*/

(function ($, ko) {
	'use strict';

	ko.extenders.sortable = function(target, options) {
		if (typeof options !== 'object') {
			options = {};
		}

		var subscriptions = [];

		function unwrapPath(object, path) {
			function unwrap(target, index) {
				if (!target) { return null; }

				if (ko.isObservable(target[index])) {
					subscriptions.push(target[index].subscribe(sortList));
				}
				return ko.unwrap(target[index]);
			}

			return path.split('.').reduce(unwrap, object);
		}

		function sortFunction(a, b) {
			var descending = target.sortDescending();

			var aValue = target.sortKey() ? unwrapPath(a, target.sortKey()) : a;
			var bValue = target.sortKey() ? unwrapPath(b, target.sortKey()) : b;

			if (aValue === null) { return bValue === null ? 0 : descending ? 1 : -1; }
			if (bValue === null) { return descending ? -1 : 1; }

			if (typeof aValue === 'string') { aValue = aValue.toLowerCase(); }
			if (typeof bValue === 'string') { bValue = bValue.toLowerCase(); }

			if (aValue < bValue) { return descending ? 1 : -1; }
			if (aValue > bValue) { return descending ? -1 : 1; }

			return 0;
		}

		target.sortKey        = ko.observable(options.key);
		target.sortDescending = ko.observable(!!options.descending);

		/**
		 * Sets the sortKey to the specified key value and reverses the sort
		 * direction if that sort key is already the current one.
		 * @param key
		 */
		target.setSortKey = function(key) {
			if (key === target.sortKey()) {
				target.sortDescending(!target.sortDescending());
			} else {
				target.sortKey(key);
				target.sortDescending(false);
			}
		};

		target.sort(sortFunction);

		var sorting;

		function sortList() {
			if (sorting) { return; }

			subscriptions.forEach(function(s) {s.dispose(); });
			subscriptions = [];

			sorting = true;
			target.sort(sortFunction);
			sorting = false;
		}

		target.subscribe(sortList);
		target.sortKey.subscribe(sortList);
		target.sortDescending.subscribe(sortList);

		return target;
	};

	/**
	 * Adds a sort caret to a header element and binds to the setSortKey property
	 * for the specified source collection.
	 */
	ko.bindingHandlers.sortBy = {
		init: function(element, valueAccessor) {

			var options = ko.unwrap(valueAccessor());
			if (!options) { return; }

			var source = options.source;
			var key    = ko.unwrap(options.key);

			if (!source || !key || !source.sortKey) { return; }

			var $sortCaret = $("<span>").addClass('sort-caret');

			function updateCaret() {
				$sortCaret.css('display', source.sortKey() === key ? 'inline-block' : 'none');
				if (source.sortDescending()) {
					$sortCaret.css({ transform: 'rotate(0)' });
				} else {
					$sortCaret.css({ transform: 'rotate(180deg)' });
				}
			}

			$(element)
				.css({ position: 'relative' })
				.append($sortCaret)
				.click(function() {
					source.setSortKey(key);
					updateCaret();
				});

			source.sortKey.subscribe(updateCaret);
			source.sortDescending.subscribe(updateCaret);
			updateCaret();
		}
	};

}(jQuery, ko));
;/*global jQuery:false, ko:false*/

/**
* loadingWhen replaces the content of a container with a loading spinner
* when the bound value is truthy.
* Styling requires the .loader class to be defined for the page as well as the loaderClass property 
* (or a default of .loader-dark)
*/
ko.bindingHandlers.loadingWhen = {
    init: function (element, valueAccessor, allBindingsAccessor) {
        var loaderClass = ko.unwrap(allBindingsAccessor()).loaderClass || "loader-white",
			$element = $(element),
			currentPosition = $element.css("position"),
			$loader = $("<span>", { "class": loaderClass }).addClass("loader").hide();

        //add the loader
        $element.append($loader);

        //make sure that we can absolutely position the loader against the original element
        if (currentPosition === "auto" || currentPosition === "static") {
            $element.css("position", "relative");
        }

           
    },
    update: function (element, valueAccessor) {
        var isLoading = ko.unwrap(valueAccessor()),
			$element = $(element),
			$childrenToHide = $element.children(":not(span.loader)"),
			$loader = $element.find("span.loader");

        if (isLoading) {
            $childrenToHide.css("visibility", "hidden").attr("disabled", "disabled");
            $loader.stop(true, true).show();
        }
        else {
            $loader.fadeOut("fast");
            $childrenToHide.css("visibility", "visible").removeAttr("disabled");
        }
    }
};
;}));
}(window));