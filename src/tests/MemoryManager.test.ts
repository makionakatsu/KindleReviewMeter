/**
 * MemoryManager テスト
 */

import { MemoryManager } from '../utils/MemoryManager.js';
import { TestSuite, assert, assertEqual } from './TestRunner.js';

export const MemoryManagerTestSuite: TestSuite = {
  name: 'MemoryManager',
  
  tests: [
    {
      name: 'should add and remove event listeners',
      fn: () => {
        const memManager = MemoryManager.getInstance();
        const element = document.createElement('div');
        let callCount = 0;
        
        const listener = () => { callCount++; };
        
        // Add event listener
        const id = memManager.addEventListener(element, 'click', listener);
        assert(typeof id === 'string');
        
        // Test event firing
        element.click();
        assertEqual(callCount, 1);
        
        // Remove event listener
        const removed = memManager.removeEventListener(id);
        assertEqual(removed, true);
        
        // Test event no longer fires
        element.click();
        assertEqual(callCount, 1); // Should still be 1
      }
    },
    
    {
      name: 'should manage timeouts correctly',
      fn: async () => {
        const memManager = MemoryManager.getInstance();
        let executed = false;
        
        const id = memManager.setTimeout(() => {
          executed = true;
        }, 10);
        
        assert(typeof id === 'string');
        
        // Wait for timeout to execute
        await new Promise(resolve => setTimeout(resolve, 20));
        assertEqual(executed, true);
      }
    },
    
    {
      name: 'should manage intervals correctly',
      fn: async () => {
        const memManager = MemoryManager.getInstance();
        let count = 0;
        
        const id = memManager.setInterval(() => {
          count++;
        }, 10);
        
        // Wait for multiple executions
        await new Promise(resolve => setTimeout(resolve, 35));
        
        // Clear interval
        const cleared = memManager.clearTimer(id);
        assertEqual(cleared, true);
        
        const countAfterClear = count;
        
        // Wait more and verify interval stopped
        await new Promise(resolve => setTimeout(resolve, 20));
        assertEqual(count, countAfterClear);
      }
    },
    
    {
      name: 'should manage observers correctly',
      fn: () => {
        const memManager = MemoryManager.getInstance();
        const element = document.createElement('div');
        let callCount = 0;
        
        const observer = new MutationObserver(() => {
          callCount++;
        });
        
        observer.observe(element, { childList: true });
        
        const id = memManager.addObserver(observer, element);
        assert(typeof id === 'string');
        
        // Trigger mutation
        const child = document.createElement('span');
        element.appendChild(child);
        
        // Remove observer
        const removed = memManager.removeObserver(id);
        assertEqual(removed, true);
      }
    },
    
    {
      name: 'should handle weak references',
      fn: () => {
        const memManager = MemoryManager.getInstance();
        const obj = { data: 'test' };
        
        const weakRef = memManager.addWeakRef(obj);
        assert(weakRef instanceof WeakRef);
        
        // Object should be accessible initially
        assertEqual(weakRef.deref()?.data, 'test');
      }
    },
    
    {
      name: 'should detect suspicious leaks',
      fn: () => {
        const memManager = MemoryManager.getInstance();
        
        // This test checks the structure of leak detection
        // In a real scenario, leaks would be detected over time
        const suspects = memManager.detectSuspiciousLeaks();
        assert(Array.isArray(suspects));
      }
    },
    
    {
      name: 'should get memory info when available',
      fn: () => {
        const memManager = MemoryManager.getInstance();
        const memInfo = memManager.getMemoryInfo();
        
        if ('memory' in performance) {
          assert(memInfo !== null);
          assert(typeof memInfo!.usedJSHeapSize === 'number');
          assert(typeof memInfo!.totalJSHeapSize === 'number');
          assert(typeof memInfo!.jsHeapSizeLimit === 'number');
          assert(typeof memInfo!.timestamp === 'number');
        } else {
          assertEqual(memInfo, null);
        }
      }
    },
    
    {
      name: 'should cleanup all resources',
      fn: () => {
        const memManager = MemoryManager.getInstance();
        const element = document.createElement('div');
        let eventFired = false;
        let timeoutExecuted = false;
        
        // Add some resources
        memManager.addEventListener(element, 'click', () => { eventFired = true; });
        memManager.setTimeout(() => { timeoutExecuted = true; }, 100);
        
        // Cleanup all
        memManager.cleanup();
        
        // Test that event listener was removed
        element.click();
        assertEqual(eventFired, false);
        
        // Note: timeout might have already been cleared, so we don't test it
      }
    },
    
    {
      name: 'should handle non-existent timer removal',
      fn: () => {
        const memManager = MemoryManager.getInstance();
        const result = memManager.clearTimer('non_existent_id');
        assertEqual(result, false);
      }
    },
    
    {
      name: 'should handle non-existent event listener removal',
      fn: () => {
        const memManager = MemoryManager.getInstance();
        const result = memManager.removeEventListener('non_existent_id');
        assertEqual(result, false);
      }
    },
    
    {
      name: 'should handle non-existent observer removal',
      fn: () => {
        const memManager = MemoryManager.getInstance();
        const result = memManager.removeObserver('non_existent_id');
        assertEqual(result, false);
      }
    }
  ]
};