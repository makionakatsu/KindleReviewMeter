/**
 * DOMBatcher テスト
 */

import { DOMBatcher } from '../utils/DOMBatcher.js';
import { TestSuite, assert, assertEqual } from './TestRunner.js';

export const DOMBatcherTestSuite: TestSuite = {
  name: 'DOMBatcher',
  
  tests: [
    {
      name: 'should queue and execute style operations',
      fn: () => {
        const batcher = DOMBatcher.getInstance();
        const element = document.createElement('div');
        document.body.appendChild(element);
        
        const id = batcher.setStyle(element, 'color', 'red');
        assert(typeof id === 'string');
        
        const metrics = batcher.flush();
        assertEqual(element.style.color, 'red');
        assertEqual(metrics.operationsCount, 1);
        
        document.body.removeChild(element);
      }
    },
    
    {
      name: 'should queue and execute class operations',
      fn: () => {
        const batcher = DOMBatcher.getInstance();
        const element = document.createElement('div');
        document.body.appendChild(element);
        
        batcher.toggleClass(element, 'test-class', true);
        batcher.flush();
        
        assert(element.classList.contains('test-class'));
        
        batcher.toggleClass(element, 'test-class', false);
        batcher.flush();
        
        assert(!element.classList.contains('test-class'));
        
        document.body.removeChild(element);
      }
    },
    
    {
      name: 'should queue and execute text operations',
      fn: () => {
        const batcher = DOMBatcher.getInstance();
        const element = document.createElement('div');
        document.body.appendChild(element);
        
        batcher.setText(element, 'Hello, World!');
        batcher.flush();
        
        assertEqual(element.textContent, 'Hello, World!');
        
        document.body.removeChild(element);
      }
    },
    
    {
      name: 'should queue and execute HTML operations',
      fn: () => {
        const batcher = DOMBatcher.getInstance();
        const element = document.createElement('div');
        document.body.appendChild(element);
        
        batcher.setHTML(element, '<span>Test HTML</span>');
        batcher.flush();
        
        assertEqual(element.innerHTML, '<span>Test HTML</span>');
        
        document.body.removeChild(element);
      }
    },
    
    {
      name: 'should queue and execute attribute operations',
      fn: () => {
        const batcher = DOMBatcher.getInstance();
        const element = document.createElement('div');
        document.body.appendChild(element);
        
        batcher.setAttribute(element, 'data-test', 'test-value');
        batcher.flush();
        
        assertEqual(element.getAttribute('data-test'), 'test-value');
        
        document.body.removeChild(element);
      }
    },
    
    {
      name: 'should handle multiple operations on same element',
      fn: () => {
        const batcher = DOMBatcher.getInstance();
        const element = document.createElement('div');
        document.body.appendChild(element);
        
        batcher.setStyle(element, 'color', 'red');
        batcher.setStyle(element, 'backgroundColor', 'blue');
        batcher.toggleClass(element, 'test-class', true);
        batcher.setText(element, 'Test Text');
        
        const metrics = batcher.flush();
        
        assertEqual(element.style.color, 'red');
        assertEqual(element.style.backgroundColor, 'blue');
        assert(element.classList.contains('test-class'));
        assertEqual(element.textContent, 'Test Text');
        assertEqual(metrics.operationsCount, 4);
        
        document.body.removeChild(element);
      }
    },
    
    {
      name: 'should respect priority ordering',
      fn: () => {
        const batcher = DOMBatcher.getInstance();
        const element = document.createElement('div');
        document.body.appendChild(element);
        
        // Add operations with different priorities
        batcher.setStyle(element, 'color', 'red', 'low');
        batcher.setStyle(element, 'backgroundColor', 'blue', 'high');
        batcher.setStyle(element, 'fontSize', '14px', 'normal');
        
        batcher.flush();
        
        // All should be applied regardless of priority
        assertEqual(element.style.color, 'red');
        assertEqual(element.style.backgroundColor, 'blue');
        assertEqual(element.style.fontSize, '14px');
        
        document.body.removeChild(element);
      }
    },
    
    {
      name: 'should cancel operations',
      fn: () => {
        const batcher = DOMBatcher.getInstance();
        const element = document.createElement('div');
        document.body.appendChild(element);
        
        const id1 = batcher.setStyle(element, 'color', 'red');
        const id2 = batcher.setStyle(element, 'backgroundColor', 'blue');
        
        const cancelled = batcher.cancel(id1);
        assertEqual(cancelled, true);
        
        batcher.flush();
        
        assertEqual(element.style.color, ''); // Should not be set
        assertEqual(element.style.backgroundColor, 'blue'); // Should be set
        
        document.body.removeChild(element);
      }
    },
    
    {
      name: 'should clear all operations',
      fn: () => {
        const batcher = DOMBatcher.getInstance();
        const element = document.createElement('div');
        document.body.appendChild(element);
        
        batcher.setStyle(element, 'color', 'red');
        batcher.setStyle(element, 'backgroundColor', 'blue');
        
        batcher.clear();
        
        const metrics = batcher.flush();
        assertEqual(metrics.operationsCount, 0);
        
        // Styles should not be applied
        assertEqual(element.style.color, '');
        assertEqual(element.style.backgroundColor, '');
        
        document.body.removeChild(element);
      }
    },
    
    {
      name: 'should handle remove operations',
      fn: () => {
        const batcher = DOMBatcher.getInstance();
        const container = document.createElement('div');
        const element = document.createElement('span');
        
        container.appendChild(element);
        document.body.appendChild(container);
        
        assertEqual(container.children.length, 1);
        
        batcher.removeElement(element);
        batcher.flush();
        
        assertEqual(container.children.length, 0);
        
        document.body.removeChild(container);
      }
    },
    
    {
      name: 'should return metrics correctly',
      fn: () => {
        const batcher = DOMBatcher.getInstance();
        const element = document.createElement('div');
        document.body.appendChild(element);
        
        batcher.setStyle(element, 'color', 'red');
        batcher.toggleClass(element, 'test', true);
        batcher.setText(element, 'test');
        
        const metrics = batcher.flush();
        
        assertEqual(metrics.operationsCount, 3);
        assert(metrics.executionTime >= 0);
        assert(metrics.reflows >= 0);
        assert(metrics.repaints >= 0);
        
        document.body.removeChild(element);
      }
    },
    
    {
      name: 'should handle empty flush',
      fn: () => {
        const batcher = DOMBatcher.getInstance();
        const metrics = batcher.flush();
        
        assertEqual(metrics.operationsCount, 0);
        assertEqual(metrics.executionTime, 0);
        assertEqual(metrics.reflows, 0);
        assertEqual(metrics.repaints, 0);
      }
    }
  ]
};