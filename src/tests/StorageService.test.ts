/**
 * StorageService テスト
 */

import { LocalStorageService } from '../services/StorageService.js';
import { TestSuite, assert, assertEqual, assertNotEqual } from './TestRunner.js';

export const StorageServiceTestSuite: TestSuite = {
  name: 'StorageService',
  
  setup: () => {
    // テスト前にlocalStorageをクリア
    localStorage.clear();
  },
  
  teardown: () => {
    // テスト後にlocalStorageをクリア
    localStorage.clear();
  },
  
  tests: [
    {
      name: 'should store and retrieve string data',
      fn: () => {
        const storage = new LocalStorageService();
        const testKey = 'test_string';
        const testValue = 'Hello, World!';
        
        const setResult = storage.set(testKey, testValue);
        assertEqual(setResult, true);
        
        const retrieved = storage.get<string>(testKey);
        assertEqual(retrieved, testValue);
      }
    },
    
    {
      name: 'should store and retrieve object data',
      fn: () => {
        const storage = new LocalStorageService();
        const testKey = 'test_object';
        const testValue = {
          name: 'Test User',
          age: 30,
          active: true,
          tags: ['user', 'test']
        };
        
        const setResult = storage.set(testKey, testValue);
        assertEqual(setResult, true);
        
        const retrieved = storage.get<typeof testValue>(testKey);
        assert(retrieved !== null);
        assertEqual(retrieved!.name, testValue.name);
        assertEqual(retrieved!.age, testValue.age);
        assertEqual(retrieved!.active, testValue.active);
        assertEqual(retrieved!.tags.length, testValue.tags.length);
      }
    },
    
    {
      name: 'should store and retrieve number data',
      fn: () => {
        const storage = new LocalStorageService();
        const testKey = 'test_number';
        const testValue = 42;
        
        storage.set(testKey, testValue);
        const retrieved = storage.get<number>(testKey);
        assertEqual(retrieved, testValue);
      }
    },
    
    {
      name: 'should store and retrieve boolean data',
      fn: () => {
        const storage = new LocalStorageService();
        
        storage.set('test_true', true);
        storage.set('test_false', false);
        
        assertEqual(storage.get<boolean>('test_true'), true);
        assertEqual(storage.get<boolean>('test_false'), false);
      }
    },
    
    {
      name: 'should return null for non-existent keys',
      fn: () => {
        const storage = new LocalStorageService();
        const result = storage.get<string>('non_existent_key');
        assertEqual(result, null);
      }
    },
    
    {
      name: 'should handle complex nested objects',
      fn: () => {
        const storage = new LocalStorageService();
        const testKey = 'test_complex';
        const testValue = {
          user: {
            profile: {
              name: 'John Doe',
              settings: {
                theme: 'dark',
                notifications: true
              }
            },
            history: [
              { action: 'login', timestamp: Date.now() },
              { action: 'view', timestamp: Date.now() + 1000 }
            ]
          },
          metadata: {
            version: '1.0.0',
            lastUpdated: new Date().toISOString()
          }
        };
        
        storage.set(testKey, testValue);
        const retrieved = storage.get<typeof testValue>(testKey);
        
        assert(retrieved !== null);
        assertEqual(retrieved!.user.profile.name, testValue.user.profile.name);
        assertEqual(retrieved!.user.profile.settings.theme, testValue.user.profile.settings.theme);
        assertEqual(retrieved!.user.history.length, testValue.user.history.length);
        assertEqual(retrieved!.metadata.version, testValue.metadata.version);
      }
    },
    
    {
      name: 'should remove data correctly',
      fn: () => {
        const storage = new LocalStorageService();
        const testKey = 'test_remove';
        const testValue = 'to be removed';
        
        storage.set(testKey, testValue);
        assertEqual(storage.get<string>(testKey), testValue);
        
        const removeResult = storage.remove(testKey);
        assertEqual(removeResult, true);
        assertEqual(storage.get<string>(testKey), null);
      }
    },
    
    {
      name: 'should handle removal of non-existent keys',
      fn: () => {
        const storage = new LocalStorageService();
        const removeResult = storage.remove('non_existent_key');
        assertEqual(removeResult, false);
      }
    },
    
    {
      name: 'should clear all data',
      fn: () => {
        const storage = new LocalStorageService();
        
        // Store multiple items
        storage.set('key1', 'value1');
        storage.set('key2', 'value2');
        storage.set('key3', { data: 'value3' });
        
        // Verify they exist
        assertNotEqual(storage.get('key1'), null);
        assertNotEqual(storage.get('key2'), null);
        assertNotEqual(storage.get('key3'), null);
        
        // Clear all
        storage.clear();
        
        // Verify they're gone
        assertEqual(storage.get('key1'), null);
        assertEqual(storage.get('key2'), null);
        assertEqual(storage.get('key3'), null);
      }
    },
    
    {
      name: 'should check key existence correctly',
      fn: () => {
        const storage = new LocalStorageService();
        const testKey = 'test_exists';
        
        assertEqual(storage.has(testKey), false);
        
        storage.set(testKey, 'test value');
        assertEqual(storage.has(testKey), true);
        
        storage.remove(testKey);
        assertEqual(storage.has(testKey), false);
      }
    },
    
    {
      name: 'should handle JSON parsing errors gracefully',
      fn: () => {
        const storage = new LocalStorageService();
        const testKey = 'test_invalid_json';
        
        // Manually set invalid JSON to localStorage
        localStorage.setItem(testKey, '{"invalid": json}');
        
        const result = storage.get<any>(testKey);
        assertEqual(result, null);
      }
    },
    
    {
      name: 'should handle special characters in keys and values',
      fn: () => {
        const storage = new LocalStorageService();
        const specialKey = 'test-key_with.special@chars';
        const specialValue = {
          text: 'Text with "quotes" and \'apostrophes\' and emoji 🚀',
          unicode: 'Unicode: αβγ δε ζηθ',
          special: 'Special chars: !@#$%^&*()_+-=[]{}|;:",.<>?'
        };
        
        storage.set(specialKey, specialValue);
        const retrieved = storage.get<typeof specialValue>(specialKey);
        
        assert(retrieved !== null);
        assertEqual(retrieved!.text, specialValue.text);
        assertEqual(retrieved!.unicode, specialValue.unicode);
        assertEqual(retrieved!.special, specialValue.special);
      }
    }
  ]
};