// Copyright 2018 YOPEY YOPEY LLC
// David Figatner
// MIT License

class SpatialHash
{
    /**
     * creates a spatial-hash cull
     * @param {object} [options]
     * @param {number} [options.size=1000] cell size used to create hash (xSize = ySize)
     * @param {number} [options.xSize] horizontal cell size
     * @param {number} [options.ySize] vertical cell size
     * @param {boolean} [options.calculatePIXI=true] calculate bounding box automatically; if this is set to false then it uses object[options.AABB] for bounding box
     * @param {boolean} [options.visible=visible] parameter of the object to set (usually visible or renderable)
     * @param {boolean} [options.simpleTest=true] iterate through visible buckets to check for bounds
     * @param {string} [options.dirtyTest=true] only update spatial hash for objects with object[options.dirtyTest]=true; this has a HUGE impact on performance
     * @param {string} [options.AABB=AABB] object property that holds bounding box so that object[type] = { x: number, y: number, width: number, height: number }
     * @param {string} [options.spatial=spatial] object property that holds object's hash list
     * @param {string} [options.dirty=dirty] object property for dirtyTest
     */
    constructor(options)
    {
        options = options || {}
        this.xSize = options.xSize || options.size || 1000
        this.ySize = options.ySize || options.size || 1000
        this.AABB = options.type || 'AABB'
        this.spatial = options.spatial || 'spatial'
        this.calculatePIXI = typeof options.calculatePIXI !== 'undefined' ? options.calculatePIXI : true
        this.visibleText = typeof options.visibleTest !== 'undefined' ? options.visibleTest : true
        this.simpleTest = typeof options.simpleTest !== 'undefined' ? options.simpleTest : true
        this.dirtyTest = typeof options.dirtyTest !== 'undefined' ? options.dirtyTest : true
        this.visible = options.visible || 'visible'
        this.dirty = options.dirty || 'dirty'
        this.width = this.height = 0
        this.hash = {}
        this.lists = [[]]
    }

    /**
     * add an object to be culled
     * side effect: adds object.spatialHashes to track existing hashes
     * @param {*} object
     * @param {boolean} [staticObject] set to true if the object's position/size does not change
     * @return {*} object
     */
    add(object, staticObject)
    {
        if (!object[this.spatial])
        {
            object[this.spatial] = { hashes: [] }
        }
        if (this.calculatePIXI && this.dirtyTest)
        {
            object[this.dirty] = true
        }
        if (staticObject)
        {
            object.staticObject = true
        }
        this.updateObject(object)
        this.lists[0].push(object)
    }

    /**
     * remove an object added by add()
     * @param {*} object
     * @return {*} object
     */
    remove(object)
    {
        this.lists[0].splice(this.list[0].indexOf(object), 1)
        this.removeFromHash(object)
        return object
    }

    /**
     * add an array of objects to be culled
     * @param {Array} array
     * @param {boolean} [staticObject] set to true if the objects in the list position/size does not change
     * @return {Array} array
     */
    addList(list, staticObject)
    {
        for (let object of list)
        {
            if (!object[this.spatial])
            {
                object[this.spatial] = { hashes: [] }
            }
            if (this.calculatePIXI && this.dirtyTest)
            {
                object[this.dirty] = true
            }
            if (staticObject)
            {
                list.staticObject = true
            }
            this.updateObject(object)
        }
        this.lists.push(list)
    }

    /**
     * remove an array added by addList()
     * @param {Array} array
     * @return {Array} array
     */
    removeList(array)
    {
        this.lists.splice(this.lists.indexOf(array), 1)
        array.forEach(object => this.removeFromHash(object))
        return array
    }

    /**
     * update the hashes and cull the items in the list
     * @param {AABB} AABB
     * @param {boolean} [skipUpdate] skip updating the hashes of all objects
     * @return {number} number of buckets in results
     */
    cull(AABB, skipUpdate)
    {
        if (!skipUpdate)
        {
            this.updateObjects()
        }
        this.invisible()
        const objects = this.query(AABB, this.simpleTest)
        objects.forEach(object => object[this.visible] = true)
        return this.lastBuckets
    }

    /**
     * set all objects in hash to visible=false
     */
    invisible()
    {
        for (let list of this.lists)
        {
            list.forEach(object => object[this.visible] = false)
        }
    }

    /**
     * update the hashes for all objects
     * automatically called from update() when skipUpdate=false
     */
    updateObjects()
    {
        if (this.dirtyTest)
        {
            for (let list of this.lists)
            {
                for (let object of list)
                {
                    if (object[this.dirty])
                    {
                        this.updateObject(object)
                        object[this.dirty] = false
                    }
                }
            }
        }
        else
        {
            for (let list of this.lists)
            {
                list.forEach(object => this.updateObject(object))
            }
        }
    }

    /**
     * update the has of an object
     * automatically called from updateObjects()
     * @param {*} object
     * @param {boolean} [force] force update for calculatePIXI
     */
    updateObject(object)
    {
        let AABB
        if (this.calculatePIXI)
        {
            const box = object.getLocalBounds()
            AABB = object[this.AABB] = {
                x: object.x + box.x * object.scale.x,
                y: object.y + box.y * object.scale.y,
                width: box.width * object.scale.x,
                height: box.height * object.scale.y
            }
        }
        else
        {
            AABB = object[this.AABB]
        }

        const spatial = object[this.spatial]
        const { xStart, yStart, xEnd, yEnd } = this.getBounds(AABB)

        // only remove and insert if mapping has changed
        if (spatial.xStart !== xStart || spatial.yStart !== yStart || spatial.xEnd !== xEnd || spatial.yEnd !== yEnd)
        {
            if (spatial.hashes.length)
            {
                this.removeFromHash(object)
            }
            for (let y = yStart; y <= yEnd; y++)
            {
                for (let x = xStart; x <= xEnd; x++)
                {
                    const key = x + ',' + y
                    this.insert(object, key)
                    spatial.hashes.push(key)
                }
            }
            spatial.xStart = xStart
            spatial.yStart = yStart
            spatial.xEnd = xEnd
            spatial.yEnd = yEnd
        }
    }

    /**
     * gets hash bounds
     * @param {AABB} AABB
     * @return {Bounds}
     * @private
     */
    getBounds(AABB)
    {
        let xStart = Math.floor(AABB.x / this.xSize)
        xStart = xStart < 0 ? 0 : xStart
        let yStart = Math.floor(AABB.y / this.ySize)
        yStart = yStart < 0 ? 0 : yStart
        let xEnd = Math.floor((AABB.x + AABB.width) / this.xSize)
        let yEnd = Math.floor((AABB.y + AABB.height) / this.ySize)
        return { xStart, yStart, xEnd, yEnd }
    }

    /**
     * insert object into the spatial hash
     * automatically called from updateObject()
     * @param {*} object
     * @param {string} key
     */
    insert(object, key)
    {
        if (!this.hash[key])
        {
            this.hash[key] = [object]
        }
        else
        {
            this.hash[key].push(object)
        }
    }

    /**
     * removes object from the hash table
     * should be called when removing an object
     * automatically called from updateObject()
     * @param {object} object
     */
    removeFromHash(object)
    {
        const spatial = object[this.spatial]
        while (spatial.hashes.length)
        {
            const key = spatial.hashes.pop()
            const list = this.hash[key]
            list.splice(list.indexOf(object), 1)
        }
    }

    /**
     * returns an array of objects contained within bounding box
     * @param {AABB} AABB bounding box to search
     * @param {boolean} [simpleTest=true] perform a simple bounds check of all items in the buckets
     * @return {object[]} search results
     */
    query(AABB, simpleTest)
    {
        simpleTest = typeof simpleTest !== 'undefined' ? simpleTest : true
        let buckets = 0
        let results = []
        const { xStart, yStart, xEnd, yEnd } = this.getBounds(AABB)
        for (let y = yStart; y <= yEnd; y++)
        {
            for (let x = xStart; x <= xEnd; x++)
            {
                const entry = this.hash[x + ',' + y]
                if (entry)
                {
                    if (simpleTest)
                    {
                        for (let object of entry)
                        {
                            const box = object.AABB
                            if (box.x + box.width > AABB.x && box.x < AABB.x + AABB.width &&
                            box.y + box.height > AABB.y && box.y < AABB.y + AABB.height)
                            {
                                results.push(object)
                            }
                        }
                    }
                    else
                    {
                        results = results.concat(entry)
                    }
                    buckets++
                }
            }
        }
        this.lastBuckets = buckets
        return results
    }

    /**
     * iterates through objects contained within bounding box
     * stops iterating if the callback returns true
     * @param {AABB} AABB bounding box to search
     * @param {function} callback
     * @param {boolean} [simpleTest=true] perform a simple bounds check of all items in the buckets
     * @return {boolean} true if callback returned early
     */
    queryCallback(AABB, callback, simpleTest)
    {
        simpleTest = typeof simpleTest !== 'undefined' ? simpleTest : true
        const { xStart, yStart, xEnd, yEnd } = this.getBounds(AABB)
        for (let y = yStart; y <= yEnd; y++)
        {
            for (let x = xStart; x <= xEnd; x++)
            {
                const entry = this.hash[x + ',' + y]
                if (entry)
                {
                    for (let i = 0; i < entry.length; i++)
                    {
                        const object = entry[i]
                        if (simpleTest)
                        {
                            const AABB = object.AABB
                            if (AABB.x + AABB.width > AABB.x && AABB.x < AABB.x + AABB.width &&
                            AABB.y + AABB.height > AABB.y && AABB.y < AABB.y + AABB.height)
                            {
                                if (callback(object))
                                {
                                    return true
                                }
                            }
                        }
                        else
                        {
                            if (callback(object))
                            {
                                return true
                            }
                        }
                    }
                }
            }
        }
        return false
    }

    /**
     * get stats
     * @return {Stats}
     */
    stats()
    {
        let visible = 0, count = 0
        for (let list of this.lists)
        {
            list.forEach(object =>
            {
                visible += object.visible ? 1 : 0
                count++
            })
        }

        return {
            total: count,
            visible,
            culled: count - visible
        }
    }

    /**
     * helper function to evaluate hash table
     * @return {number} the number of buckets in the hash table
     * */
    getBuckets()
    {
        return Object.keys(this.hash).length
    }

    /**
     * helper function to evaluate hash table
     * @return {number} the average number of entries in each bucket
     */
    getAverageSize()
    {
        let total = 0
        for (let key in this.hash)
        {
            total += this.hash[key].length
        }
        return total / this.getBuckets()
    }

    /**
     * helper function to evaluate the hash table
     * @return {number} the largest sized bucket
     */
    getLargest()
    {
        let largest = 0
        for (let key in this.hash)
        {
            if (this.hash[key].length > largest)
            {
                largest = this.hash[key].length
            }
        }
        return largest
    }

    /** helper function to evalute the hash table
     * @param {AABB} AABB bounding box to search
     * @return {number} sparseness percentage (i.e., buckets with at least 1 element divided by total possible buckets)
     */
    getSparseness(AABB)
    {
        let count = 0, total = 0
        const { xStart, yStart, xEnd, yEnd } = this.getBounds(AABB)
        for (let y = yStart; y < yEnd; y++)
        {
            for (let x = xStart; x < xEnd; x++)
            {
                count += (this.hash[x + ',' + y] ? 1 : 0)
                total++
            }
        }
        return count / total
    }
}

/**
 * @typedef {object} Stats
 * @property {number} total
 * @property {number} visible
 * @property {number} culled
 */

/**
 * @typedef {object} Bounds
 * @property {number} xStart
 * @property {number} yStart
 * @property {number} xEnd
 * @property {number} xEnd
 */

/**
  * @typedef {object} AABB
  * @property {number} x
  * @property {number} y
  * @property {number} width
  * @property {number} height
  */

module.exports = SpatialHash