"use strict";

/**
 * @module opcua.address_space
 * @class AddressSpace
 */

const assert = require("node-opcua-assert").assert;
const _ = require("underscore");

const StatusCodes = require("node-opcua-status-code").StatusCodes;



const translate_service = require("node-opcua-service-translate-browse-path");
const BrowsePathResult = translate_service.BrowsePathResult;
const BrowsePath = translate_service.BrowsePath;

exports.install = function (AddressSpace) {

    /**
     * browse some path.
     *
     * @method browsePath
     * @param  {BrowsePath} browsePath
     * @return {BrowsePathResult}
     *
     * This service can be used translates one or more browse paths into NodeIds.
     * A browse path is constructed of a starting Node and a RelativePath. The specified starting Node
     * identifies the Node from which the RelativePath is based. The RelativePath contains a sequence of
     * ReferenceTypes and BrowseNames.
     *
     *   |StatusCode                    |                                                            |
     *   |------------------------------|:-----------------------------------------------------------|
     *   |BadNodeIdUnknown              |                                                            |
     *   |BadNodeIdInvalid              |                                                            |
     *   |BadNothingToDo                | - the relative path contains an empty list )               |
     *   |BadBrowseNameInvalid          | - target name is missing in relative path                  |
     *   |UncertainReferenceOutOfServer | - The path element has targets which are in another server.|
     *   |BadTooManyMatches             |                                                            |
     *   |BadQueryTooComplex            |                                                            |
     *   |BadNoMatch                    |                                                            |
     *
     *
     *
     */
    AddressSpace.prototype.browsePath = function (browsePath) {

        const self = this;

        assert(browsePath instanceof translate_service.BrowsePath);

        const startingNode = self.findNode(browsePath.startingNode);

        if (!startingNode) {
            return new BrowsePathResult({statusCode: StatusCodes.BadNodeIdUnknown});
        }

        if (!browsePath.relativePath.elements || browsePath.relativePath.elements.length === 0) {
            return new BrowsePathResult({
                statusCode: StatusCodes.BadNothingToDo,
                targets: []
            });
        }


        const elements_length = browsePath.relativePath.elements.length;
        //-------------------------------------------------------------------------------------------------------
        // verify standard RelativePath construction
        //   from OPCUA 1.03 - PArt 3 - 7.6 RelativePath:
        //   TargetName  The BrowseName of the target node.
        //               The final element may have an empty targetName. In this situation all targets of the
        //               references identified by the referenceTypeId are the targets of the RelativePath.
        //               The targetName shall be specified for all other elements.
        //               The current path cannot be followed any further if no targets with the specified
        //               BrowseName exist.
        //   Let's detect null targetName which are not in last position and return Bad_BrowseNameInvalid if not
        //
        const empty_targetName_not_in_lastPos = browsePath.relativePath.elements.reduce(function(prev,e,index) {
            const is_last = ( (index + 1) === elements_length);
            const isBad = ( !is_last && ( !e.targetName || e.targetName.isEmpty()));
            return prev + ( ( !is_last && ( !e.targetName || e.targetName.isEmpty())) ? 1 :0 );
        },0);
        if (empty_targetName_not_in_lastPos) {
            return new BrowsePathResult({statusCode: StatusCodes.BadBrowseNameInvalid});
        }

        // from OPCUA 1.03 - PArt 3 - 5.8.4 TranslateBrowsePathToNodeIds
        // TranslateBrowsePathToNodeIds further restrict RelativePath targetName rules:
        // The last element in the relativePath shall always have a targetName specified.
        const last_el = browsePath.relativePath.elements[elements_length - 1];
        if (!last_el.targetName || !last_el.targetName.name || last_el.targetName.name.length === 0) {
            return new BrowsePathResult({statusCode: StatusCodes.BadBrowseNameInvalid});
        }

        const res = [];

        function explore_element(curNodeObject, elements, index) {

            const element = elements[index];
            assert(element instanceof translate_service.RelativePathElement);

            const is_last = ( (index + 1) === elements.length);

            const nodeIds = curNodeObject.browseNodeByTargetName(element,is_last);

            const targets = nodeIds.map(function (nodeId) {
                return {
                    targetId: nodeId,
                    remainingPathIndex: elements.length - index
                };
            });

            if (!is_last) {
                // explorer
                targets.forEach(function (target) {
                    const node = self.findNode(target.targetId);
                    explore_element(node, elements, index + 1);
                });
            } else {
                targets.forEach(function (target) {
                    res.push({
                        targetId: target.targetId,
                        remainingPathIndex: 0xFFFFFFFF
                    });
                });
            }
        }

        explore_element(startingNode, browsePath.relativePath.elements, 0);

        if (res.length === 0) {
            return new BrowsePathResult({statusCode: StatusCodes.BadNoMatch});
        }

        return new BrowsePathResult({
            statusCode: StatusCodes.Good,
            targets: res
        });
    };

};
