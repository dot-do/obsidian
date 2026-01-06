import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { Debouncer, EventCoalescer } from '../../src/vault/debounce.js'

describe('Debouncer', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('schedule', () => {
    it('should call callback after delay', () => {
      const callback = vi.fn()
      const debouncer = new Debouncer<number>(callback, 100)

      debouncer.schedule('key1', 42)
      expect(callback).not.toHaveBeenCalled()

      vi.advanceTimersByTime(100)
      expect(callback).toHaveBeenCalledTimes(1)
      expect(callback).toHaveBeenCalledWith('key1', 42)
    })

    it('should reset timer on repeated calls with same key', () => {
      const callback = vi.fn()
      const debouncer = new Debouncer<number>(callback, 100)

      debouncer.schedule('key1', 1)
      vi.advanceTimersByTime(50)
      debouncer.schedule('key1', 2)
      vi.advanceTimersByTime(50)
      expect(callback).not.toHaveBeenCalled()

      vi.advanceTimersByTime(50)
      expect(callback).toHaveBeenCalledTimes(1)
      expect(callback).toHaveBeenCalledWith('key1', 2)
    })

    it('should handle multiple keys independently', () => {
      const callback = vi.fn()
      const debouncer = new Debouncer<number>(callback, 100)

      debouncer.schedule('key1', 1)
      vi.advanceTimersByTime(50)
      debouncer.schedule('key2', 2)

      vi.advanceTimersByTime(50)
      expect(callback).toHaveBeenCalledTimes(1)
      expect(callback).toHaveBeenCalledWith('key1', 1)

      vi.advanceTimersByTime(50)
      expect(callback).toHaveBeenCalledTimes(2)
      expect(callback).toHaveBeenCalledWith('key2', 2)
    })

    it('should use default delay of 100ms', () => {
      const callback = vi.fn()
      const debouncer = new Debouncer<number>(callback)

      debouncer.schedule('key1', 42)
      vi.advanceTimersByTime(99)
      expect(callback).not.toHaveBeenCalled()

      vi.advanceTimersByTime(1)
      expect(callback).toHaveBeenCalledTimes(1)
    })
  })

  describe('cancel', () => {
    it('should cancel pending callback', () => {
      const callback = vi.fn()
      const debouncer = new Debouncer<number>(callback, 100)

      debouncer.schedule('key1', 42)
      expect(debouncer.cancel('key1')).toBe(true)

      vi.advanceTimersByTime(100)
      expect(callback).not.toHaveBeenCalled()
    })

    it('should return false for non-pending key', () => {
      const callback = vi.fn()
      const debouncer = new Debouncer<number>(callback, 100)

      expect(debouncer.cancel('nonexistent')).toBe(false)
    })
  })

  describe('flush', () => {
    it('should immediately execute all pending callbacks', () => {
      const callback = vi.fn()
      const debouncer = new Debouncer<number>(callback, 100)

      debouncer.schedule('key1', 1)
      debouncer.schedule('key2', 2)

      debouncer.flush()

      expect(callback).toHaveBeenCalledTimes(2)
      expect(callback).toHaveBeenCalledWith('key1', 1)
      expect(callback).toHaveBeenCalledWith('key2', 2)
    })

    it('should clear pending list after flush', () => {
      const callback = vi.fn()
      const debouncer = new Debouncer<number>(callback, 100)

      debouncer.schedule('key1', 1)
      debouncer.flush()
      expect(debouncer.size).toBe(0)

      // Advancing time should not trigger additional calls
      vi.advanceTimersByTime(100)
      expect(callback).toHaveBeenCalledTimes(1)
    })
  })

  describe('clear', () => {
    it('should clear all pending callbacks without executing', () => {
      const callback = vi.fn()
      const debouncer = new Debouncer<number>(callback, 100)

      debouncer.schedule('key1', 1)
      debouncer.schedule('key2', 2)
      debouncer.clear()

      vi.advanceTimersByTime(100)
      expect(callback).not.toHaveBeenCalled()
      expect(debouncer.size).toBe(0)
    })
  })

  describe('size', () => {
    it('should return number of pending callbacks', () => {
      const callback = vi.fn()
      const debouncer = new Debouncer<number>(callback, 100)

      expect(debouncer.size).toBe(0)
      debouncer.schedule('key1', 1)
      expect(debouncer.size).toBe(1)
      debouncer.schedule('key2', 2)
      expect(debouncer.size).toBe(2)
      debouncer.schedule('key1', 3) // Update existing
      expect(debouncer.size).toBe(2)
    })
  })

  describe('isPending', () => {
    it('should return true for pending keys', () => {
      const callback = vi.fn()
      const debouncer = new Debouncer<number>(callback, 100)

      debouncer.schedule('key1', 1)
      expect(debouncer.isPending('key1')).toBe(true)
      expect(debouncer.isPending('key2')).toBe(false)
    })
  })
})

describe('EventCoalescer', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('add', () => {
    it('should call callback with coalesced event types', () => {
      const callback = vi.fn()
      const coalescer = new EventCoalescer(callback, 50)

      coalescer.add('file.md', 'create')
      coalescer.add('file.md', 'modify')

      vi.advanceTimersByTime(50)

      expect(callback).toHaveBeenCalledTimes(1)
      const [key, types] = callback.mock.calls[0]
      expect(key).toBe('file.md')
      expect(types.has('create')).toBe(true)
      expect(types.has('modify')).toBe(true)
    })

    it('should pass latest data to callback', () => {
      const callback = vi.fn()
      const coalescer = new EventCoalescer(callback, 50)

      coalescer.add('file.md', 'create', { version: 1 })
      coalescer.add('file.md', 'modify', { version: 2 })

      vi.advanceTimersByTime(50)

      const [, , data] = callback.mock.calls[0]
      expect(data).toEqual({ version: 2 })
    })

    it('should handle multiple keys independently', () => {
      const callback = vi.fn()
      const coalescer = new EventCoalescer(callback, 50)

      coalescer.add('file1.md', 'create')
      coalescer.add('file2.md', 'modify')

      vi.advanceTimersByTime(50)

      expect(callback).toHaveBeenCalledTimes(2)
    })

    it('should reset timer on repeated events', () => {
      const callback = vi.fn()
      const coalescer = new EventCoalescer(callback, 50)

      coalescer.add('file.md', 'create')
      vi.advanceTimersByTime(30)
      coalescer.add('file.md', 'modify')
      vi.advanceTimersByTime(30)

      expect(callback).not.toHaveBeenCalled()

      vi.advanceTimersByTime(20)
      expect(callback).toHaveBeenCalledTimes(1)
    })
  })

  describe('clear', () => {
    it('should clear all pending events without executing', () => {
      const callback = vi.fn()
      const coalescer = new EventCoalescer(callback, 50)

      coalescer.add('file1.md', 'create')
      coalescer.add('file2.md', 'modify')
      coalescer.clear()

      vi.advanceTimersByTime(50)
      expect(callback).not.toHaveBeenCalled()
      expect(coalescer.size).toBe(0)
    })
  })

  describe('size', () => {
    it('should return number of pending event groups', () => {
      const callback = vi.fn()
      const coalescer = new EventCoalescer(callback, 50)

      expect(coalescer.size).toBe(0)
      coalescer.add('file1.md', 'create')
      expect(coalescer.size).toBe(1)
      coalescer.add('file2.md', 'modify')
      expect(coalescer.size).toBe(2)
      coalescer.add('file1.md', 'modify') // Same key
      expect(coalescer.size).toBe(2)
    })
  })
})
