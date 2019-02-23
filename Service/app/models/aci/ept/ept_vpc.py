from ...rest import Rest
from ...rest import api_callback
from ...rest import api_register
import logging
import time

# module level logging
logger = logging.getLogger(__name__)

@api_register(parent="fabric", path="ept/vpc")
class eptVpc(Rest):
    """ provides a mapping of port-channel interface to vpc id """ 
    logger = logger

    META_ACCESS = {
        "create": False,
        "read": True,
        "update": False,
        "delete": False,
        "db_index": ["fabric","name"],      # fabric+name(dn) is unique (for insert/update)
        "db_index2": ["fabric", "node", "intf"],    # second index for quick lookup
    }

    META = {
        "name": {
            "type": str,
            "key": True,
            "key_sn": "vpc",
            "description":"name(dn) for vpcRsVpcConf that created this object",
        },
        "node": {
            "type": int,
            "min": 1,
            "max": 0xffffffff,
            "description": "node id in which this vpc belongs",
        },
        "intf": {
            "type": str,
            "description": "port-channel interface id",
        },
        "vpc": {
            "type": int,
            "description": "vpc id matching between leafs in vpc domain",
        },
        "ts": {
            "type": float,
            "description": "epoch timestamp the object was created or updated",
        },
    }

    @classmethod
    @api_callback("before_create")
    def before_vpc_create(cls, data):
        """ set create time on object """
        data["ts"] = time.time()
        return data
