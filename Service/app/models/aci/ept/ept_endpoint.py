
from ... rest import Rest
from ... rest import api_register
from ... rest import api_route
from ... rest import api_callback
from .. utils import clear_endpoint
from . common import get_mac_value
from . common import parse_vrf_name
from . common import subscriber_op
from . ept_history import eptHistory
from . ept_move import eptMove
from . ept_msg import MSG_TYPE
from . ept_node import eptNode
from . ept_offsubnet import eptOffSubnet
from . ept_rapid import eptRapid
from . ept_remediate import eptRemediate
from . ept_subnet import eptSubnet
from . ept_stale import eptStale
from flask import abort
from flask import jsonify

import logging
import threading
import time

# module level logging
logger = logging.getLogger(__name__)

# reusable attributes for local event piggy-backing on history meta for consistency
common_attr = ["ts", "status", "intf_id", "intf_name", "pctag", "encap", "rw_mac", "rw_bd", 
                "epg_name", "vnid_name"]
local_event = {
    "node": {
        "type": int,
        "description": """
        node id of local node where the endpoint was learned. node id may be pseudo node representing
        a vpc domain.
        """,
    },
}
# pull common attributes from eptHistory 
for a in common_attr:
    local_event[a] = eptHistory.META["events"]["meta"][a]

@api_register(parent="fabric", path="ept/endpoint")
class eptEndpoint(Rest):
    """ endpoint info 
        this is very similar to eptMove except it creates an event for unique local learns (and 
        tracks the first local learn) as well as deletes.  It's similar to APIC endpoint tracker 
        which can be used to see general learns (attach) and deletes (detach) events.  Also, all
        known endpoints are present so can be used to get total number of endpoints along with 
        searching for endpoints within the fabric.
    """
    logger = logger

    META_ACCESS = {
        "namespace": "endpoint",
        "create": False,
        "read": True,
        "update": False,
        "delete": False,                # custom delete function through workers
        "db_index": ["addr", "vnid", "fabric"],
        "db_shard_enable": True,
        "db_shard_index": ["addr"],
        "db_index2": ["addr_byte"],      # second index for quick lookup on addr_byte
    }

    META = {
        "vnid": {
            "type": int,
            "key": True,
            "key_index": 1,
            "description": """
            26-bit vxlan network identifier (VNID). For MACs this is the BD VNID and for IPs this is 
            the vrf VNID.
            """,
        },
        "addr": {
            "type": str,
            "key": True,
            "key_index": 2,
            "default": "0.0.0.0",   # default is only used for swagger docs example fields
            "description": """
            for endpoints of type ipv4 this is 32-bit ipv4 address, for endpoints of type ipv6 this
            is 64-bit ipv6 address, and for endpoints of type mac this is 48-bit mac address
            """,
        },
        "addr_byte": {
            "type": list,
            "subtype": int,
            "description": """
            list of 32-bit integer values to create address.  For ipv4 this is single ipv4 interger
            value. For ipv6 this is 4 integers (128 bits) with most significant bits first in list.
            For mac, this is 2 integers where first integer is 16 most significant bits and second
            integer is 32 least significant bits.
            """,
        },
        "type": {
            "type": str,
            "description": "endpoint type (mac, ipv4, ipv6)",
            "default": "mac",
            "values": ["mac", "ipv4", "ipv6"],
        },
        "is_stale": {
            "type": bool,
            "default": False,
            "description": "endpoint is currently stale in the fabric",
        },
        "is_offsubnet": {
            "type": bool,
            "default": False,
            "description": "endpoint is currently learned offsubnet",
        },
        "is_rapid": {
            "type": bool,
            "default": False,
            "description": """ endpoint is currently flagged as rapid due to high number of events
            within short interval and new events will be ignored until 
            """,
        },
        "is_rapid_ts": {
            "type": float,
            "description": "timestamp endpoint was flagged as rapid",
        },
        "rapid_lts": {
            "type": float,
            "description": "timestamp when last rate calculation was performed",
        },
        "rapid_count": {
            "type": int,
            "description": "epm event count for rapid rate calculation",
        },
        "rapid_lcount": {
            "type": int,
            "description": "epm event count when last rapid rate calculation was performed",
        },  
        "rapid_icount": {
            "type": int,
            "description": "epm events ignored while endpoint was marked as rapid",
        },
        "first_learn": {
            "type": dict,
            "description": """
            first local learn event seen within the fabric. Note, this is only applicable to the 
            time the fabric monitor was running.  I.e, this the first learn the fabric monitor 
            found and may not be the first time the endpoint was seen within the fabric if the 
            monitor was not running.  This is maintained even after the 'events' list wraps
            """,
            "meta": local_event,
        },
        "count": {
            "type": int,
            "description": """
            total number of events that have occurred. Note, the events list is limited by 
            the eptSettings max_endpoint_events threshold but this count will be the total count 
            including the events that have wrapped.
            """,
        },
        "events": {
            "type": list,
            "subtype": dict,
            "description": "",
            "meta": local_event,
        },
        # reference attributes
        "nodes": {
            "reference": True,
            "type": list,
            "subtype": int,
            "description": "list of node ids"
        },
    }

    @classmethod
    @api_route(path="delete", methods=["DELETE"], swag_ret=["success"])
    def bulk_delete_all_endpoints(cls, fabric, vnid=None):
        """ delete all endpoints and all historical data from database for the provided fabric.
            This requires that the fabric monitor is stopped.
        """
        from .. fabric import Fabric
        f = Fabric.load(fabric=fabric)
        if not f.exists():
            abort(404, "fabric '%s' not found" % fabric)
        # ensure that the fabric is not running
        if f.get_fabric_status(api=False):
            abort(400, "cannot perform bulk endpoint delete while fabric is running")
        flt = {"fabric": fabric}
        if vnid is not None and vnid>0: 
            flt["vnid"] = vnid
        # get number of endpoints that will be cleared
        count = 0
        js = eptEndpoint.read(_params={"count":1}, _projection={"addr":1}, _filters=flt)
        if "count" in js:
            count = js["count"]
        # create message for fabric history
        msg = "bulk delete"
        if vnid is not None:
            msg+= " endpoint filter(vnid:%s)" % vnid
        else:
            msg+= " all endpoints"
        msg+= " count(%s)" % js["count"]
        f.add_fabric_event("cleared", msg)
        cls.delete(_filters=flt)
        return jsonify({"success":True, "count":js["count"]})

    @api_route(path="delete", methods=["DELETE"], swag_ret=["success"])
    def delete_endpoint(self):
        """ delete endpoint and all historical data from database """
        (success, err_str) = subscriber_op(self.fabric, MSG_TYPE.DELETE_EPT, qnum=0, data={
                "addr": self.addr,
                "vnid": self.vnid,
                "type": self.type,
            })
        if success:
            return jsonify({"success": True})
        abort(500, err_str)

    @api_route(path="refresh", methods=["POST"], swag_ret=["success"])
    def refresh_endpoint(self):
        """ force endpoint refresh by querying APIC epmDb to get current state of endpoint """
        (success, err_str) = subscriber_op(self.fabric, MSG_TYPE.REFRESH_EPT, qnum=0, data={
                "addr": self.addr,
                "vnid": self.vnid,
                "type": self.type,
            })
        if success:
            return jsonify({"success": True})
        abort(500, err_str)

    @classmethod
    @api_callback("before_create")
    def before_create(cls, data):
        """ before create auto-detect type and update integer value for addr and mask list 
            note, here addr can be mac, ipv4, or ipv6 address
        """
        # endpoint mac always in format XX:XX:XX:XX:XX:XX
        if data["type"] == "mac":
            addr = get_mac_value(data["addr"])
            data["addr_byte"] = [
                (addr & 0xffff00000000) >> 32,
                (addr & 0x0000ffffffff),
            ]
        elif data["type"] == "ipv6":
            (data["addr_byte"], _) = eptSubnet.get_prefix_array("ipv6",data["addr"])
        else:
            (data["addr_byte"], _) = eptSubnet.get_prefix_array("ipv4",data["addr"])
        return data

    @api_callback("after_delete")
    def after_delete(cls, filters):
        """ after delete ensure that eptHistory, eptMove, eptOffsubnet, and eptStale are deleted """
        eptMove.delete(_filters=filters)
        eptOffSubnet.delete(_filters=filters)
        eptStale.delete(_filters=filters)
        eptHistory.delete(_filters=filters)
        eptRapid.delete(_filters=filters)
        eptRemediate.delete(_filters=filters)

    @api_route(path="clear", methods=["POST"], swag_ret=["success", "error"])
    def clear_endpoint(self, nodes=[]):
        """ clear endpoint on one or more nodes """
        # on-demand import of eptWorkerFabric only at api call (prevents circular imports)
        from . ept_worker_fabric import eptWorkerFabric
        from .. fabric import Fabric
        # validate credentials exists before any other validation
        f = Fabric.load(fabric=self.fabric)
        if len(f.ssh_password) == 0 or len(f.ssh_username) == 0:
            abort(400, "cannot clear endpoint, ssh credentials not configured.")
        
        if self.type == "mac":
            addr_type = "mac"
            vrf_name = ""
        else:
            addr_type = "ip"
            # get the vrf name so consuming function does not need to perform this op multiple times
            if len(self.events) > 0:
                vrf_name = parse_vrf_name(self.events[0]["vnid_name"])
                if vrf_name is None:
                    abort(500, "failed to parse vrf name from vnid(%s) name %s" % (
                        self.vnid, self.events[0]["vnid_name"]))
            else:
                logger.warn("no events for this endpoint, cannot determine vrf_name")
                abort(400, "cannot execute clear for this endpoint as vrf name is unresolved")

        # need to get pod for each node, ignore unknown nodes
        error_rows = []
        valid_nodes = []    # list of tuples (pod, node)
        for n in nodes:
            obj = eptNode.load(fabric=self.fabric, node=n)
            if obj.exists():
                # ensure this node is a leaf before adding to valid nodes
                if obj.role == "leaf":
                    valid_nodes.append((obj.pod_id, obj.node))
                else:
                    logger.debug("invalid role %s for node %s", obj.role, n)
                    error_rows.append("cannot clear endpoint on node %s, role %s" % (n,obj.role))
            else:
                logger.debug("invalid/unknown node:0x%04x for fabric %s", n, self.fabric)
                error_rows.append("invalid/unknown node %s"  % n)
        if len(valid_nodes) == 0:
            error_rows.append("no valid nodes provided")
            abort(400, ". ".join(error_rows))

        # execute clear endpoint in parallel across each node
        def per_node_clear_endpoint(switch):
            switch["ret"] = clear_endpoint(self.fabric, switch["pod"], switch["node"], self.vnid, 
                                self.addr, addr_type, vrf_name)
            if switch["ret"]:
                # add event to eptRemediate and send notification
                switch["worker_fabric"].push_event(eptRemediate._classname, {
                        "fabric": self.fabric,
                        "vnid": self.vnid,
                        "addr": self.addr,
                        "type": self.type,
                        "node": switch["node"],
                    }, {
                        "ts": time.time(),
                        "vnid_name": self.first_learn["vnid_name"],
                        "reason": "api",
                        "action": "clear"
                    })
                # send notification if enabled
                subject = "api clear endpoint"
                txt = "api clear endpoint [fabric: %s, %s, addr: %s]" % (
                    self.fabric,
                    self.events[0]["vnid_name"] if len(self.events)>0 else "vnid:%d" % self.vnid,
                    self.addr
                )
                switch["worker_fabric"].send_notification("clear", subject, txt)
            return

        worker_fabric = eptWorkerFabric(self.fabric)
        threads = []
        process = {}
        for (pod, node) in valid_nodes:
            process[node] = {
                "pod": pod,
                "node": node,
                "worker_fabric": worker_fabric,
                "ret": None
            }
            t = threading.Thread(target=per_node_clear_endpoint, args=(process[node],))
            t.start()
            threads.append(t)
        for t in threads: t.join()
        for node in process:
            if not process[node]["ret"]: 
                error_rows.append("failed to clear endpoint on node %s" % node)
        return jsonify({
            "success": len(error_rows)==0, 
            "error": ". ".join(error_rows)
        })


class eptEndpointEvent(object):
    # status will only be created or deleted, used for easy detection of deleted endpoints.
    def __init__(self, **kwargs):
        self.ts = kwargs.get("ts", 0)
        self.node = kwargs.get("node", 0)
        self.status = kwargs.get("status", "created")
        self.intf_id = kwargs.get("intf_id", "")
        self.intf_name = kwargs.get("intf_name", "")
        self.pctag = kwargs.get("pctag", 0)
        self.encap = kwargs.get("encap", "")
        self.rw_mac = kwargs.get("rw_mac", "")
        self.rw_bd = kwargs.get("rw_bd", 0)
        self.epg_name = kwargs.get("epg_name", "")
        self.vnid_name = kwargs.get("vnid_name", "")

    def __repr__(self):
        return "%s node:0x%04x %.3f: pctag:0x%x, intf:%s, encap:%s, rw:[0x%06x, %s]" % (
                self.status, self.node, self.ts, self.pctag, self.intf_id, self.encap, 
                self.rw_bd, self.rw_mac
            )

    def to_dict(self):
        """ convert object to dict for insertion into eptEndpoint events list """
        return {
            "node": self.node,
            "status": self.status,
            "ts": self.ts,
            "pctag": self.pctag,
            "encap": self.encap,
            "intf_id": self.intf_id,
            "intf_name": self.intf_name,
            "rw_mac": self.rw_mac,
            "rw_bd": self.rw_bd,
            "epg_name": self.epg_name,
            "vnid_name": self.vnid_name,
        }

    @staticmethod
    def from_dict(d):
        """ create eptEndpointEvent from dict """
        return eptEndpointEvent(**d)

    @staticmethod
    def from_history_event(node, h):
        """ create eptEndpointEvent from eptHistoryEvent """
        event = eptEndpointEvent()
        event.node = node
        # intentionally ignore status from history event, will set directly to created/deleted 
        # before updating eptEndpoint entry
        #event.status = h.status       
        event.ts = h.ts
        event.pctag = h.pctag
        event.encap = h.encap
        event.intf_id = h.intf_id
        event.intf_name = h.intf_name
        event.epg_name = h.epg_name
        event.vnid_name = h.vnid_name
        event.rw_mac = h.rw_mac
        event.rw_bd = h.rw_bd
        return event


